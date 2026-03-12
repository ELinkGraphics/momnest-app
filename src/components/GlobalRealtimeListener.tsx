import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { playMessageSound } from '@/utils/notificationSound';

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
        (payload) => {
          // Only play sound if this message is NOT from the current user
          const senderId = (payload.new as any)?.sender_id;
          if (senderId && senderId !== user.id) {
            playMessageSound();
          }
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
