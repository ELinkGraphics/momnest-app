import { supabase } from '@/integrations/supabase/client';
import { chatDb, LocalMessage, sanitizeMessage } from './db';

// Concurrency guards for synchronization
const syncRegistry = new Map<string, Promise<any>>();
const listSyncRegistry = new Map<string, Promise<void>>();
 
/**
 * Generic helper to enqueue a story-related action for background synchronization.
 */
export const enqueueStoryAction = async (
  type: 'story_view' | 'story_like' | 'story_unlike' | 'story_message',
  payload: any
) => {
  const id = crypto.randomUUID();
  await chatDb.sync_queue.put({
    id,
    type,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'pending'
  });
  processSyncQueue().catch(console.error);
};

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

      // 1. Parallelize all remote fetches
      const [{ data: logData, error: msgError }, { data: receipts }, { data: reactions }] = await Promise.all([
        // @ts-ignore
        (supabase.rpc as any)('sync_messages', {
          p_conversation_id: conversationId,
          p_after_seq: lastSeq
        }),
        supabase
          .from('read_receipts' as any)
          .select('*')
          .eq('conversation_id', conversationId) as any,
        supabase
          .from('message_reactions' as any)
          .select('id, message_id, user_id, emoji, created_at, messages!inner(conversation_id)')
          .eq('messages.conversation_id', conversationId) as any
      ]);
 
      if (msgError) {
        console.error('Delta sync failed:', msgError);
        return;
      }
 
      // 2. Process Reactions (Strip join metadata)
      const reactionsToInsert = (reactions as any[])?.map(r => {
        const { messages, ...reactionData } = r;
        return reactionData;
      }) || [];
 
      if ((!logData || logData.length === 0) && (!receipts || receipts.length === 0) && (reactionsToInsert.length === 0)) {
        return 0; // Up to date
      }
 
      const messagesToInsert: LocalMessage[] = [];
 
      // 3. Process the messages
      if (logData) {
        for (const msg of logData) {
          const sanitized = sanitizeMessage({
            id: msg.id,
            conversation_id: msg.conversation_id,
            sender_id: String(msg.sender_id),
            content: msg.content,
            message_type: msg.message_type,
            attachment_url: msg.attachment_url,
            reply_to_id: msg.reply_to_id,
            forwarded_from_name: msg.forwarded_from_name,
            created_at: msg.created_at,
            updated_at: msg.updated_at,
            seq: Number(msg.seq),
            sync_status: 'sent'
          });
 
          // Diagnostic check for dexie-encrypted fields (must not be undefined)
          for (const field of ['content', 'attachment_url', 'sender_id', 'message_type', 'reply_to_id', 'forwarded_from_name']) {
            if ((sanitized as any)[field] === undefined) {
              console.error(`[Sync] CRITICAL: field "${field}" is undefined for message ${sanitized.id}. This will crash local DB.`);
            }
          }
 
          messagesToInsert.push(sanitized);
        }
      }
 
      // 4. Batch write everything to Dexie in ONE atomic transaction
      await chatDb.transaction('rw', chatDb.messages, chatDb.conversations, chatDb.read_receipts, chatDb.message_reactions, async () => {
        if (messagesToInsert.length > 0) {
          try {
            await chatDb.messages.bulkPut(messagesToInsert);
            const batchMax = Math.max(...messagesToInsert.map(m => m.seq || 0));
            if (batchMax > safeMaxSeq) safeMaxSeq = batchMax;
          } catch (bulkErr) {
            console.warn('[Sync] Bulk insert failed, falling back to individual inserts:', bulkErr);
            for (const m of messagesToInsert) {
              try {
                await chatDb.messages.put(m);
                if ((m.seq ?? 0) > safeMaxSeq) safeMaxSeq = m.seq!;
              } catch (singleErr) {
                console.error(`[Sync] Failed to insert message ${m.id}:`, singleErr);
              }
            }
          }
        }
 
        // Update high-water mark
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
 
        if (reactionsToInsert.length > 0) {
          await chatDb.message_reactions.bulkPut(reactionsToInsert);
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
        // Use a transaction to safely merge server data with local state
        await chatDb.transaction('rw', chatDb.conversations_meta, async () => {
          for (const serverConv of data) {
            const localConv = await chatDb.conversations_meta.get(serverConv.conversation_id);
            
            // OPTIMISTIC PRESERVATION:
            // If we have a local record and the server is telling us there are unread messages,
            // but we recently marked it as read (unread_count === 0 locally), 
            // we trust our local state until the server syncs up.
            if (localConv && localConv.unread_count === 0 && serverConv.unread_count > 0) {
              // Keep local zero unread count
              await chatDb.conversations_meta.put({
                ...serverConv,
                unread_count: 0
              });
            } else {
              // Otherwise, take server data
              await chatDb.conversations_meta.put(serverConv);
            }
          }
        });
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
  const BATCH_SIZE = 50;
  console.log(`[Sync] Processing sync queue (${queue.length} items)...`);
 
  // 1. Group items by type for batching
  const messageInserts = queue.filter(item => item.type === 'message_insert' && item.retry_count < MAX_RETRIES);
  const otherItems = queue.filter(item => item.type !== 'message_insert');
 
  // 2. Process message_insert in batches
  for (let i = 0; i < messageInserts.length; i += BATCH_SIZE) {
    const batch = messageInserts.slice(i, i + BATCH_SIZE);
    
    // SANITIZATION: Ensure UUID fields are null instead of "" for Supabase
    const payloads = batch.map(item => ({
      ...item.payload,
      reply_to_id: item.payload.reply_to_id || null,
      attachment_url: item.payload.attachment_url || null,
    }));
    
    const batchIds = batch.map(item => item.id);
    const messageIds = batch.map(item => item.payload.id);
 
    try {
      // Mark batch as processing
      await chatDb.sync_queue.where('id').anyOf(batchIds).modify({ status: 'processing' });
 
      const { error } = await supabase
        .from('messages')
        .upsert(payloads, { onConflict: 'id', ignoreDuplicates: true } as any);
 
      if (error) throw error;
 
      // Atomic local cleanup for the whole batch
      await chatDb.transaction('rw', chatDb.messages, chatDb.sync_queue, async () => {
        await chatDb.messages.where('id').anyOf(messageIds).modify({ sync_status: 'delivered' });
        await chatDb.sync_queue.bulkDelete(batchIds);
      });
 
      console.log(`[Sync] Successfully batched ${batch.length} messages.`);
    } catch (err: any) {
      console.error(`[Sync] Failed to process message batch starting with ${batch[0].id}:`, err);
      
      // Bulk update retry counts and handle maximum retries
      await chatDb.transaction('rw', chatDb.sync_queue, chatDb.messages, async () => {
        for (const item of batch) {
          const newRetryCount = (item.retry_count || 0) + 1;
          if (newRetryCount >= MAX_RETRIES) {
            // Permanent failure: mark message as failed and remove from queue
            await chatDb.messages.update(item.payload.id, { sync_status: 'failed' });
            await chatDb.sync_queue.delete(item.id);
          } else {
            // Incremental failure: update queue item
            await chatDb.sync_queue.update(item.id, {
              status: 'pending',
              retry_count: newRetryCount
            });
          }
        }
      });
 
      if (err.code === 'PGRST301') break; // Fatal auth
    }
  }
 
  // 3. Process other items individually (like read_receipts which are usually unique per heartbeat)
  for (const item of otherItems) {
    if (item.retry_count >= MAX_RETRIES) {
      await chatDb.sync_queue.delete(item.id);
      continue;
    }
 
    try {
      await chatDb.sync_queue.update(item.id, { status: 'processing' });
 
      if (item.type === 'read_receipt') {
        const { id, ...receiptPayload } = item.payload;
        const { error } = await supabase
          .from('read_receipts' as any)
          .upsert(receiptPayload, { onConflict: 'conversation_id,user_id' });
 
        if (error) throw error;
        await chatDb.sync_queue.delete(item.id);
      } else if (item.type === 'story_view') {
        const { error } = await supabase.from('story_views').insert(item.payload);
        if (error && error.code !== '23505') throw error; // Ignore duplicate views
        await chatDb.sync_queue.delete(item.id);
      } else if (item.type === 'story_like') {
        const { error } = await supabase.from('story_likes').insert(item.payload);
        if (error && error.code !== '23505') throw error; // Ignore duplicate likes
        await chatDb.sync_queue.delete(item.id);
      } else if (item.type === 'story_unlike') {
        const { error } = await supabase.from('story_likes').delete().match(item.payload);
        if (error) throw error;
        await chatDb.sync_queue.delete(item.id);
      } else if (item.type === 'story_message') {
        const { error } = await supabase.from('story_messages').insert(item.payload);
        if (error) throw error;
        await chatDb.sync_queue.delete(item.id);
      }
      // Add other types here if needed (message_update, etc.)
    } catch (err: any) {
      console.error(`[Sync] Failed to process queue item ${item.id}:`, err);
      await chatDb.sync_queue.update(item.id, {
        status: 'pending',
        retry_count: item.retry_count + 1
      });
      if (err.code === 'PGRST301') break;
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
