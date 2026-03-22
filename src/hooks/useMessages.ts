import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb } from '@/lib/db';
import { syncConversation } from '@/lib/sync';

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
  const [profileCache, setProfileCache] = useState<Record<string, any>>({});
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Local data stream via Dexie (Replaces network fetch)
  const localMessages = useLiveQuery(
    () => {
      if (!conversationId) return [];
      return chatDb.messages
        .where('conversation_id')
        .equals(conversationId)
        .sortBy('created_at');
    },
    [conversationId]
  );

  // 2. Resolve missing sender profiles
  useEffect(() => {
    if (!localMessages || localMessages.length === 0) return;
    
    const missingSenderIds = [...new Set(localMessages.map(m => m.sender_id))]
      .filter(id => !profileCache[id]);
      
    if (missingSenderIds.length > 0) {
      supabase.from('profiles')
        .select('id, name, username, avatar_url, initials')
        .in('id', missingSenderIds)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setProfileCache(prev => {
              const newCache = { ...prev };
              data.forEach(p => { newCache[p.id] = p; });
              return newCache;
            });
          }
        });
    }
  }, [localMessages, profileCache]);

  // 3. Background Sync & Realtime Trigger
  useEffect(() => {
    if (!conversationId) return;

    let isMounted = true;

    const doSync = async () => {
      try {
        setIsSyncing(true);
        await syncConversation(conversationId);
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    };

    // Initial background sync
    doSync();

    // Listen for server changes to trigger delta syncs instead of pulling full payloads
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          doSync();
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
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

  const messagesWithSenders = localMessages?.map((msg: any) => ({
    ...msg,
    sender: profileCache[msg.sender_id] ? {
      name: profileCache[msg.sender_id].name,
      username: profileCache[msg.sender_id].username,
      avatar_url: profileCache[msg.sender_id].avatar_url,
      initials: profileCache[msg.sender_id].initials
    } : undefined
  })) || [];

  return {
    messages: (messagesWithSenders as Message[]) || [],
    isLoading: localMessages === undefined,
    isSyncing,
    error: null,
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
    onSuccess: async (_, variables) => {
      // Trigger local DB sync immediately so the UI updates
      await syncConversation(variables.conversationId);
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
