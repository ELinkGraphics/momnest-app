import { supabase } from '@/integrations/supabase/client';
import { chatDb, sanitizeMessage } from '@/lib/db';

export async function syncConversation(conversationId: string) {
  if (!conversationId) return;

  try {
    // 1. Get the last known sequence ID for this conversation
    const conv = await chatDb.conversations.get(conversationId);
    const lastSeq = conv?.last_seen_seq || 0;

    // 2. Fetch deltas from the server
    // @ts-ignore
    const { data, error } = await (supabase.rpc as any)('sync_messages', {
      p_conversation_id: conversationId,
      p_after_seq: lastSeq
    });

    if (error) {
      console.error('Delta sync failed:', error);
      return;
    }

    const logData = data as any[];
    if (!logData || logData.length === 0) {
      return 0; // Up to date
    }

    let maxSeq = lastSeq;
    const messagesToInsert: any[] = [];

    // 3. Process the messages
    for (const msg of logData) {
      const sanitized = sanitizeMessage({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: String(msg.sender_id),
        content: msg.content,
        message_type: msg.message_type,
        attachment_url: msg.attachment_url,
        reply_to_id: msg.reply_to_id,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        seq: Number(msg.seq),
        sync_status: 'synced'
      });

      // Diagnostic check for dexie-encrypted fields (must not be undefined)
      for (const field of ['content', 'attachment_url', 'sender_id', 'message_type', 'reply_to_id']) {
        if ((sanitized as any)[field] === undefined) {
          console.error(`[Sync] CRITICAL: field "${field}" is undefined for message ${sanitized.id}. This will crash local DB.`);
        }
      }

      messagesToInsert.push(sanitized);
      if (msg.seq > maxSeq) maxSeq = msg.seq;
    }

    // 4. Batch write messages and high-water mark to Dexie
    await chatDb.transaction('rw', chatDb.messages, chatDb.conversations, chatDb.read_receipts, async () => {
      if (messagesToInsert.length > 0) {
        await chatDb.messages.bulkPut(messagesToInsert);
      }

      // Update the high-water mark
      await chatDb.conversations.put({
        id: conversationId,
        last_seen_seq: maxSeq
      });

    // 5. Fetch read receipts for this conversation BEFORE opening the transaction
    const { data: receipts } = await supabase
      .from('read_receipts' as any)
      .select('*')
      .eq('conversation_id', conversationId) as { data: any[] | null };

    // 6. Batch write messages and high-water mark to Dexie
    await chatDb.transaction('rw', chatDb.messages, chatDb.conversations, chatDb.read_receipts, async () => {
      if (messagesToInsert.length > 0) {
        await chatDb.messages.bulkPut(messagesToInsert);
      }

      // Update the high-water mark
      await chatDb.conversations.put({
        id: conversationId,
        last_seen_seq: maxSeq
      });

      if (receipts && receipts.length > 0) {
        await chatDb.read_receipts.bulkPut(receipts.map(r => ({
          user_id: r.user_id,
          conversation_id: r.conversation_id,
          last_read_seq: r.last_read_seq,
          updated_at: r.updated_at
        })));
      }
    });

    console.log(`[Sync] Conversation ${conversationId} synced ${messagesToInsert.length} messages. Cursor at ${maxSeq}`);

    // Attempt to process queue after a successful sync
    processSyncQueue().catch(console.error);

    return logData.length;
  } catch (err) {
    console.error('Error during chat sync:', err);
  }
}

export async function processSyncQueue() {
  const queue = await chatDb.sync_queue.toArray();
  if (queue.length === 0) return;

  console.log(`[Sync] Processing sync queue (${queue.length} items)...`);

  for (const item of queue) {
    try {
      if (item.type === 'message_insert') {
        const { error } = await supabase.from('messages').insert(item.payload);
        if (error) throw error;

        // On success, update the local message to 'synced' and remove from queue
        await chatDb.transaction('rw', chatDb.messages, chatDb.sync_queue, async () => {
          await chatDb.messages.update(item.payload.id, { sync_status: 'synced' });
          await chatDb.sync_queue.delete(item.id);
        });
      } else if (item.type === 'read_receipt') {
        const { error } = await supabase
          .from('read_receipts' as any)
          .upsert(item.payload);

        if (error) throw error;

        // On success, remove from queue
        await chatDb.sync_queue.delete(item.id);
      }
      // Future: handle message_update, message_delete, read_receipt
    } catch (err: any) {
      console.error(`[Sync] Failed to process queue item ${item.id}:`, err);

      // Increment retry count
      await chatDb.sync_queue.update(item.id, {
        retry_count: item.retry_count + 1
      });

      // Simple backoff or abort if it's a fatal error (e.g., auth)
      if (err.code === 'PGRST301') {
        console.error('Fatal auth error, stopping queue processing.');
        break;
      }
    }
  }
}

export async function cleanupOldData() {
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  try {
    // Delete messages older than 90 days that are fully synced
    const oldMessages = await chatDb.messages
      .where('created_at').below(cutoffDate)
      .and(msg => msg.sync_status === 'synced')
      .primaryKeys();

    if (oldMessages.length > 0) {
      await chatDb.messages.bulkDelete(oldMessages);
      console.log(`[Eviction] Cleared ${oldMessages.length} old synced messages to save storage.`);
    }
  } catch (err) {
    console.error('[Eviction] Failed to cleanup old data:', err);
  }
}

export function registerSyncListeners() {
  if (typeof window === 'undefined') return;

  // Trigger sync queue when network comes back online
  window.addEventListener('online', () => {
    console.log('[Network] Back online, processing sync queue...');
    processSyncQueue().catch(console.error);
  });

  // Try to register Background Sync API if supported by Service Worker
  if ('serviceWorker' in navigator) {
    if ('SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        try {
          // @ts-ignore - sync is valid in browsers supporting Background Sync
          registration.sync.register('chat-sync');
          console.log('[Background Sync] Registered "chat-sync".');
        } catch (e) {
          console.warn('[Background Sync] Registration failed.', e);
        }
      });
    }

    // Listen for wake-up calls from the Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'PROCESS_SYNC_QUEUE') {
        console.log('[Background Sync] Service worker requested sync queue processing...');
        processSyncQueue().catch(console.error);
      }
    });
  }

  // Run cleanup once on load
  cleanupOldData().catch(console.error);
}
