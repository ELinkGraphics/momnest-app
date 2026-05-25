import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb } from '@/lib/db';
import { useUser } from '@/contexts/UserContext';

/**
 * Hook to provide real-time unread message counts from the local Dexie database.
 * 
 * ARCHITECTURE: Unread count is DERIVED from sequence numbers, not stored as a counter.
 * Formula: unread = max(0, conversation_max_seq - user_last_read_seq)
 * This is the same approach used by WhatsApp/Telegram — the count is always
 * computed, never manually incremented/decremented, so it can never drift.
 */
export const useUnreadCount = () => {
  const { user } = useUser();
  const userId = user?.id;

  // Get all conversation metadata + read receipts in one reactive query
  const unreadData = useLiveQuery(async () => {
    if (!userId) return { counts: new Map<string, number>(), total: 0 };

    const [metas, receipts, conversations] = await Promise.all([
      chatDb.conversations_meta.toArray(),
      chatDb.read_receipts.where('conversation_id').above('').toArray(),
      chatDb.conversations.toArray(),
    ]);

    // Build a map of user's read positions: conversationId -> last_read_seq
    const readMap = new Map<string, number>();
    for (const r of receipts) {
      if (r.user_id === userId) {
        readMap.set(r.conversation_id, r.last_read_seq);
      }
    }

    // Build a map of conversation max seqs from the conversations table
    const seqMap = new Map<string, number>();
    for (const c of conversations) {
      seqMap.set(c.id, c.last_seen_seq);
    }

    // Compute per-conversation unread counts
    const counts = new Map<string, number>();
    let total = 0;

    for (const meta of metas) {
      const maxSeq = seqMap.get(meta.conversation_id) || 0;
      const lastRead = readMap.get(meta.conversation_id) || 0;
      
      // Use the stored unread_count as a fallback if we don't have seq data yet
      // This handles the case where GlobalRealtimeListener increments the count
      // before sync has pulled the actual messages with seq numbers
      let unread: number;
      if (maxSeq > 0) {
        // Derived count from seq — this is the source of truth
        unread = Math.max(0, maxSeq - lastRead);
      } else {
        // Fallback to stored counter for conversations not yet synced
        unread = meta.unread_count || 0;
      }

      if (unread > 0) {
        // Only count as unread if the last message wasn't sent by us
        if (meta.last_message_sender_id !== userId) {
          counts.set(meta.conversation_id, unread);
          total += unread;
        }
      }
    }

    return { counts, total };
  }, [userId]);

  const totalUnreadCount = unreadData?.total || 0;

  /**
   * Get the unread count for a specific conversation.
   * Used for per-conversation badges in the conversation list.
   */
  const getUnreadCountForConversation = (conversationId: string) => {
    return unreadData?.counts.get(conversationId) || 0;
  };

  return {
    totalUnreadCount,
    getUnreadCountForConversation,
    hasUnread: totalUnreadCount > 0,
  };
};
