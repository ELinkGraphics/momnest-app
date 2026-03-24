import { supabase } from '@/integrations/supabase/client';
import { chatDb, LocalMessage, sanitizeMessage } from './db';

// Concurrency guards for synchronization
const syncRegistry = new Map<string, Promise<any>>();
const listSyncRegistry = new Map<string, Promise<void>>();

export const syncConversation = async (conversationId: string) => {
  if (syncRegistry.has(conversationId)) {
    console.log(`[Sync] Sync already in-flight for ${conversationId}, joining existing promise.`);
    return syncRegistry.get(conversationId);
  }

  const syncPromise = (async () => {
    try {
      console.log(`[Sync] Starting delta sync for conversation: ${conversationId}`);

      const conv = await chatDb.conversations.get(conversationId);
      const lastSeq = conv?.last_seen_seq || 0;
      let safeMaxSeq = lastSeq;

      // 1. Fetch encrypted delta from RPC
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

      const messagesToInsert: LocalMessage[] = [];

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
          sync_status: 'sent'
        });

        // Diagnostic check for dexie-encrypted fields (must not be undefined)
        for (const field of ['content', 'attachment_url', 'sender_id', 'message_type', 'reply_to_id']) {
          if ((sanitized as any)[field] === undefined) {
            console.error(`[Sync] CRITICAL: field "${field}" is undefined for message ${sanitized.id}. This will crash local DB.`);
          }
        }

        messagesToInsert.push(sanitized);
      }

      // 4. Fetch read receipts for this conversation BEFORE opening the transaction
      const { data: receipts } = await supabase
        .from('read_receipts' as any)
        .select('*')
        .eq('conversation_id', conversationId) as { data: any[] | null };

      // 5. Fetch reactions for this conversation
      const { data: reactions } = await (supabase.rpc as any)('get_conversation_reactions', {
        p_conversation_id: conversationId
      });

      // 6. Batch write messages, high-water mark, read receipts, and reactions to Dexie
      await chatDb.transaction('rw', chatDb.messages, chatDb.conversations, chatDb.read_receipts, chatDb.message_reactions, async () => {
        if (messagesToInsert.length > 0) {
          try {
            await chatDb.messages.bulkPut(messagesToInsert);
            // If bulkPut succeeds, advance safeMaxSeq to the highest seq in the batch
            const batchMax = Math.max(...messagesToInsert.map(m => m.seq || 0));
            if (batchMax > safeMaxSeq) safeMaxSeq = batchMax;
          } catch (bulkErr) {
            console.warn('[Sync] Bulk insert failed, falling back to individual inserts:', bulkErr);
            for (const m of messagesToInsert) {
              try {
                await chatDb.messages.put(m);
                // Only advance cursor if this specific message was saved
                if ((m.seq ?? 0) > safeMaxSeq) safeMaxSeq = m.seq!;
              } catch (singleErr) {
                console.error(`[Sync] Failed to insert potentially corrupt message ${m.id} (seq: ${m.seq}):`, singleErr);
                // Cursor does NOT advance past this failed message
              }
            }
          }
        }

        // Update the high-water mark (ONLY up to the last successful message)
        await chatDb.conversations.put({
          id: conversationId,
          last_seen_seq: safeMaxSeq
        });

        if (receipts && receipts.length > 0) {
          await chatDb.read_receipts.bulkPut(receipts.map(r => ({
            user_id: r.user_id,
            conversation_id: r.conversation_id,
            last_read_seq: r.last_read_seq,
            updated_at: r.updated_at
          })));
        }

        if (reactions && reactions.length > 0) {
          await chatDb.message_reactions.bulkPut(reactions);
        }
      });

      console.log(`[Sync] Conversation ${conversationId} synced. Cursor advanced to ${safeMaxSeq}`);

      // Attempt to process queue after a successful sync
      processSyncQueue().catch(console.error);

      return messagesToInsert.length;
    } catch (err) {
      console.error('Error during chat sync:', err);
    } finally {
      syncRegistry.delete(conversationId);
    }
  })();

  syncRegistry.set(conversationId, syncPromise);
  return syncPromise;
};

/**
 * Synchronizes the conversation list metadata to Dexie for offline-first access.
 */
export const syncConversations = async (userId: string) => {
  if (listSyncRegistry.has(userId)) {
    return listSyncRegistry.get(userId);
  }

  const syncPromise = (async () => {
    try {
      console.log(`[Sync] Syncing conversation list for user: ${userId}`);
      const { data, error } = await supabase
        .rpc('get_user_conversations', { _user_id: userId });

      if (error) {
        console.error('[Sync] Failed to fetch conversation list:', error);
        return;
      }

      if (data && data.length > 0) {
        await chatDb.conversations_meta.bulkPut(data);
      }
    } catch (err) {
      console.error('[Sync] Unexpected error during list sync:', err);
    } finally {
      listSyncRegistry.delete(userId);
    }
  })();

  listSyncRegistry.set(userId, syncPromise);
  return syncPromise;
};

/**
 * Synchronizes pinned conversations for a user.
 */
export const syncPinnedConversations = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('pinned_conversations' as any)
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    if (data) {
      await chatDb.pinned_conversations.clear();
      await chatDb.pinned_conversations.bulkPut(data as any[]);
    }
  } catch (err) {
    console.error('[Sync] Failed to sync pinned conversations:', err);
  }
};

/**
 * Toggles the pinned state of a conversation on both local DB and server.
 */
export const togglePinnedConversation = async (userId: string, conversationId: string, isPinned: boolean) => {
  // 1. Optimistic Update (Local DB)
  if (isPinned) {
    await chatDb.pinned_conversations.put({
      conversation_id: conversationId,
      user_id: userId,
      pinned_at: new Date().toISOString()
    });
  } else {
    await chatDb.pinned_conversations.delete(conversationId);
  }

  // 2. Background Server Update
  (async () => {
    try {
      if (isPinned) {
        const { error } = await supabase
          .from('pinned_conversations' as any)
          .upsert({ user_id: userId, conversation_id: conversationId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pinned_conversations' as any)
          .delete()
          .match({ user_id: userId, conversation_id: conversationId });
        if (error) throw error;
      }
    } catch (err) {
      console.error('[Sync] Failed to toggle pin on server:', err);
      // Re-sync on failure to ensure consistency
      syncPinnedConversations(userId).catch(() => {});
    }
  })();
};

export async function processSyncQueue() {
  const queue = await chatDb.sync_queue.toArray();
  if (queue.length === 0) return;

  const MAX_RETRIES = 5;
  console.log(`[Sync] Processing sync queue (${queue.length} items)...`);

  for (const item of queue) {
    // Skip if already failed too many times
    if (item.retry_count >= MAX_RETRIES) {
      console.warn(`[Sync] Skipping item ${item.id} (type: ${item.type}) due to max retries (${MAX_RETRIES}).`);
      // Optional: Move to dead_letter or just delete to unblock
      await chatDb.sync_queue.delete(item.id);
      continue;
    }

    try {
      // Phase 1: Mark as processing
      await chatDb.sync_queue.update(item.id, { status: 'processing' });

      if (item.type === 'message_insert') {
        // Use upsert with ignoreDuplicates for idempotency
        const { error } = await supabase
          .from('messages')
          .upsert(item.payload, { onConflict: 'id', ignoreDuplicates: true } as any);

        if (error) throw error;

        // Phase 2: Atomic local cleanup
        await chatDb.transaction('rw', chatDb.messages, chatDb.sync_queue, async () => {
          await chatDb.messages.update(item.payload.id, { sync_status: 'sent' });
          await chatDb.sync_queue.delete(item.id);
        });
      } else if (item.type === 'read_receipt') {
        // Strip the local Dexie 'id' before sending to Supabase
        const { id, ...receiptPayload } = item.payload;
        const { error } = await supabase
          .from('read_receipts' as any)
          .upsert(receiptPayload, { onConflict: 'conversation_id,user_id' });

        if (error) throw error;

        // Phase 2: Atomic local cleanup
        await chatDb.sync_queue.delete(item.id);
      }
    } catch (err: any) {
      console.error(`[Sync] Failed to process queue item ${item.id}:`, err);

      // Restore status to pending and increment retry count
      await chatDb.sync_queue.update(item.id, {
        status: 'pending',
        retry_count: item.retry_count + 1
      });

      // Abort processing on fatal auth errors
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
      .and(msg => msg.sync_status === 'sent')
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
