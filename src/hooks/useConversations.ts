import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Conversation {
  conversation_id: string;
  other_user_id: string | null;
  other_user_name: string;
  other_user_username: string | null;
  other_user_avatar: string | null;
  other_user_initials: string;
  other_user_online: boolean;
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
  member_count: number;
}

export const useConversations = (userId: string | undefined) => {
  const { data: conversations, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .rpc('get_user_conversations', { _user_id: userId });

      if (error) throw error;
      
      const sorted = (data || []).sort((a: Conversation, b: Conversation) => {
        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return timeB - timeA;
      });
      
      return sorted as Conversation[];
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30000,
  });

  // Realtime is handled globally by GlobalRealtimeListener

  return {
    conversations: conversations || [],
    isLoading,
    error,
    refetch,
  };
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();

  const createConversation = async (currentUserId: string, otherUserId: string) => {
    const { data, error } = await supabase.rpc('get_or_create_conversation', {
      _user1_id: currentUserId,
      _user2_id: otherUserId,
    });

    if (error) throw error;

    // Invalidate conversations query to refresh the list
    queryClient.invalidateQueries({ queryKey: ['conversations'] });

    return data as string;
  };

  return { createConversation };
};
