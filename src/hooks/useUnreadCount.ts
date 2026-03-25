import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb, type LocalConversationMeta } from '@/lib/db';

/**
 * Hook to provide real-time unread message counts from the local Dexie database.
 * This is the single source of truth for message badges across the app.
 */
export const useUnreadCount = () => {
  // Get all conversation metadata to calculate global total
  const conversationsMeta = useLiveQuery(() => chatDb.conversations_meta.toArray()) as LocalConversationMeta[] | undefined || [];

  // Total unread count across all conversations
  const totalUnreadCount = conversationsMeta.reduce(
    (sum: number, meta: LocalConversationMeta) => sum + (meta.unread_count || 0),
    0
  );

  /**
   * Get the unread count for a specific conversation.
   * Useful for per-user badges in the conversation list.
   */
  const getUnreadCountForConversation = (conversationId: string) => {
    const meta = conversationsMeta.find((m: LocalConversationMeta) => m.conversation_id === conversationId);
    return meta?.unread_count || 0;
  };

  return {
    totalUnreadCount,
    getUnreadCountForConversation,
    conversationsMeta, // Optional: exposing raw data if needed for lists
    hasUnread: totalUnreadCount > 0,
  };
};
