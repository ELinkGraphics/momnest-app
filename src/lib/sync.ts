import { supabase } from '@/integrations/supabase/client';
import { chatDb } from '@/lib/db';

export async function syncConversation(conversationId: string) {
  if (!conversationId) return;

  try {
    // 1. Get the last known sequence ID for this conversation
    const conv = await chatDb.conversations.get(conversationId);
    const lastSeq = conv?.last_seen_seq || 0;

    // 2. Fetch deltas from the server
    // @ts-ignore - sync_messages RPC is newly added, types may be outdated
    const { data, error } = await (supabase.rpc as any)('sync_messages', {
      p_conversation_id: conversationId,
      p_last_seq: lastSeq,
      p_limit: 1000
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
    const readReceiptsToInsert: any[] = [];

    // 3. Process the replication log
    for (const row of logData) {
      if (row.type === 'message') {
        const p = row.payload;
        messagesToInsert.push({
          id: p.id,
          conversation_id: p.conversation_id,
          sender_id: p.sender_id,
          content: p.content,
          created_at: p.created_at,
          updated_at: p.updated_at,
          seq: p.seq,
          sync_status: 'synced'
        });
        if (p.seq > maxSeq) maxSeq = p.seq;
      } else if (row.type === 'read_receipt') {
        const p = row.payload;
        readReceiptsToInsert.push({
          user_id: p.user_id,
          conversation_id: p.conversation_id,
          last_read_seq: p.last_read_seq,
          updated_at: p.updated_at
        });
        if (p.seq > maxSeq) maxSeq = p.seq;
      }
    }

    // 4. Batch write to Dexie
    await chatDb.transaction('rw', chatDb.messages, chatDb.conversations, chatDb.read_receipts, async () => {
      if (messagesToInsert.length > 0) {
        await chatDb.messages.bulkPut(messagesToInsert);
      }
      if (readReceiptsToInsert.length > 0) {
        await chatDb.read_receipts.bulkPut(readReceiptsToInsert);
      }
      
      // Update the high-water mark
      await chatDb.conversations.put({
        id: conversationId,
        last_seen_seq: maxSeq
      });
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

