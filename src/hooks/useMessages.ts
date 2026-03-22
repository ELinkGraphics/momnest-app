import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb, sanitizeMessage } from '@/lib/db';
import { syncConversation, processSyncQueue } from '@/lib/sync';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  attachment_url: string;
  reply_to_id: string;
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

  // Mark conversation as read when viewing (Local-First)
  useEffect(() => {
    if (!conversationId || !userId || !localMessages || localMessages.length === 0) return;

    const markAsRead = async () => {
      const lastMsg = localMessages[localMessages.length - 1];
      if (!lastMsg.seq) return;

      const receipt = {
        user_id: userId,
        conversation_id: conversationId,
        last_read_seq: lastMsg.seq,
        updated_at: new Date().toISOString()
      };

      // 1. Update local DB
      await chatDb.read_receipts.put(receipt);

      // 2. Queue for server sync
      await chatDb.sync_queue.put({
        id: `read_${conversationId}_${userId}`,
        type: 'read_receipt',
        payload: receipt,
        created_at: new Date().toISOString(),
        retry_count: 0
      });

      // 3. Trigger queue processing
      processSyncQueue().catch(console.error);
    };

    markAsRead();
  }, [conversationId, userId, localMessages]);

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
  const otherReceipt = useLiveQuery(() => {
    if (!conversationId || !currentUserId) return null;
    return chatDb.read_receipts
      .where('conversation_id')
      .equals(conversationId)
      .and(r => r.user_id !== currentUserId)
      .first();
  }, [conversationId, currentUserId]);

  return otherReceipt?.last_read_seq || 0;
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
      const messageId = crypto.randomUUID();
      const now = new Date().toISOString();

      const insertData: any = {
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: messageType,
        created_at: now,
        updated_at: now,
      };
      if (attachmentUrl) insertData.attachment_url = attachmentUrl;
      if (replyToId) insertData.reply_to_id = replyToId;

      // 1. Instantly write to local UI db
      await chatDb.messages.put(sanitizeMessage({
        ...insertData,
        attachment_url: attachmentUrl,
        reply_to_id: replyToId,
        message_type: messageType,
        sync_status: 'pending'
      }));

      // 2. Try pushing to server (if online)
      if (navigator.onLine) {
        const { error } = await supabase
          .from('messages')
          .insert(insertData);

        if (error) {
          console.warn('Server push failed, queuing locally:', error);
          await chatDb.sync_queue.put({
            id: messageId,
            type: 'message_insert',
            payload: insertData,
            created_at: now,
            retry_count: 0
          });
        } else {
          // Success, upgrade to synced
          await chatDb.messages.update(messageId, { sync_status: 'synced' });
        }
      } else {
        // Offline: enqueue silently
        await chatDb.sync_queue.put({
          id: messageId,
          type: 'message_insert',
          payload: insertData,
          created_at: now,
          retry_count: 0
        });
      }

      return insertData;
    },
    onSuccess: async (_, variables) => {
      // Trigger local DB sync immediately so the queue processes
      await syncConversation(variables.conversationId);
      processSyncQueue().catch(console.error);
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
