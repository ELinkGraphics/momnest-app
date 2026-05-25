import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { playMessageSound } from '@/utils/notificationSound';
import { chatDb } from '@/lib/db';
import { syncConversations } from '@/lib/sync';

/**
 * App-level component that listens for realtime changes to messages and notifications,
 * then instantly invalidates relevant queries so badges update everywhere without reload.
 */
const GlobalRealtimeListener = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const prevUnreadRef = useRef<number>(-1);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('global-badge-updates')
      // Instant message badge: any new/changed message triggers conversation refetch
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as any;
          const senderId = msg?.sender_id;

          // ✅ ONLY increment if current user is the receiver, not the sender
          if (senderId && senderId === user.id) return;

          // Only play sound if this message is NOT from the current user
          if (senderId) {
            playMessageSound();
          }

          // ✅ Also skip if the conversation is currently open and visible
          const currentPath = window.location.pathname;
          const isMainChatOpen = currentPath === `/messages/${msg.conversation_id}`;
          const isShopChatOpen = currentPath === `/shop/messages/${msg.conversation_id}`;
          const isConversationOpen = (isMainChatOpen || isShopChatOpen) && !document.hidden;

          if (isConversationOpen) {
            // The active chat's useMessages hook will handle marking it as read
            // To ensure we don't have a temporary visual glitch, proactively reset it locally
            try {
              if (msg.conversation_id) {
                await chatDb.conversations_meta.update(msg.conversation_id, { unread_count: 0 });
              }
            } catch (err) {
              console.error('Failed to optimistically reset unread count:', err);
            }
            return;
          }

          // ✅ Otherwise, it's a legit background message for *this* user
          if (msg.conversation_id) {
            try {
              const conv = await chatDb.conversations_meta.get(msg.conversation_id);
              if (conv) {
                await chatDb.conversations_meta.update(msg.conversation_id, {
                  unread_count: (conv.unread_count || 0) + 1,
                  last_message: msg.content,
                  last_message_at: msg.created_at,
                  last_message_sender_id: msg.sender_id
                });
              } else {
                // NEW CONVERSATION: Create an immediate placeholder entry so the badge
                // appears instantly. The full sync will fill in the rest of the data.
                await chatDb.conversations_meta.put({
                  conversation_id: msg.conversation_id,
                  other_user_id: msg.sender_id,
                  other_user_name: 'New message',
                  other_user_username: null,
                  other_user_avatar: null,
                  other_user_initials: '?',
                  other_user_online: false,
                  last_message: msg.content,
                  last_message_at: msg.created_at,
                  last_message_sender_id: msg.sender_id,
                  unread_count: 1,
                  is_group: false,
                  group_name: null,
                  group_avatar_url: null,
                  member_count: 0,
                });
                // Then trigger a full sync to get the real data
                syncConversations(user.id).catch(console.error);
              }
            } catch (err) {
              console.error('Failed to optimistically update unread count:', err);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      // When read status updates, refresh conversations for badge count
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      // Instant notification badge: new push_notifications
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'push_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['push-notifications'] });
        }
      )
      // When notification is marked read
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'push_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['push-notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return null;
};

export default GlobalRealtimeListener;
