import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  sender?: {
    name: string;
    username: string;
    avatar_url: string | null;
    initials: string;
  };
}

export const useMessages = (conversationId: string | null, userId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: messages, isLoading, error } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // First get messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;
      if (!messagesData || messagesData.length === 0) return [];

      // Get unique sender IDs
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];

      // Fetch sender profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, initials')
        .in('id', senderIds);

      if (profilesError) throw profilesError;

      // Create a map for quick lookup
      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Transform the data to match our Message type
      const transformedData = messagesData.map(msg => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id) ? {
          name: profilesMap.get(msg.sender_id)!.name,
          username: profilesMap.get(msg.sender_id)!.username,
          avatar_url: profilesMap.get(msg.sender_id)!.avatar_url,
          initials: profilesMap.get(msg.sender_id)!.initials
        } : undefined
      }));

      return transformedData as Message[];
    },
    enabled: !!conversationId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Real-time subscription for new messages and read status updates
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('New message received:', payload);
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Refetch when read status changes
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Mark conversation as read when viewing
  useEffect(() => {
    if (!conversationId || !userId) return;

    const markAsRead = async () => {
      const { error } = await supabase.rpc('mark_conversation_read', {
        _conversation_id: conversationId,
        _user_id: userId,
      });

      if (error) {
        console.error('Error marking conversation as read:', error);
      } else {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };

    markAsRead();
  }, [conversationId, userId, queryClient]);

  return {
    messages: messages || [],
    isLoading,
    error,
  };
};

export const useOtherUserLastRead = (conversationId: string | null, currentUserId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: lastReadAt } = useQuery({
    queryKey: ['other-user-last-read', conversationId, currentUserId],
    queryFn: async () => {
      if (!conversationId || !currentUserId) return null;

      const { data, error } = await supabase
        .from('conversation_members')
        .select('last_read_at')
        .eq('conversation_id', conversationId)
        .neq('user_id', currentUserId)
        .single();

      if (error) return null;
      return data?.last_read_at || null;
    },
    enabled: !!conversationId && !!currentUserId,
    refetchInterval: 10000,
  });

  // Listen for real-time updates to conversation_members
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`read-status:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['other-user-last-read', conversationId, currentUserId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, queryClient]);

  return lastReadAt;
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      conversationId,
      senderId,
      content,
      messageType = 'text',
      attachmentUrl,
      replyToId,
    }: {
      conversationId: string;
      senderId: string;
      content: string;
      messageType?: string;
      attachmentUrl?: string;
      replyToId?: string;
    }) => {
      const insertData: any = {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: messageType,
      };
      if (attachmentUrl) insertData.attachment_url = attachmentUrl;
      if (replyToId) insertData.reply_to_id = replyToId;

      const { data, error } = await supabase
        .from('messages')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    },
  });

  return {
    sendMessage: sendMessageMutation.mutate,
    isSending: sendMessageMutation.isPending,
  };
};
