import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb, sanitizeMessage } from '@/lib/db';
import { syncConversation, processSyncQueue } from '@/lib/sync';
import { useNotifications } from './useNotifications';
import { debounce } from '@/lib/utils';

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
  const lastSyncedSeq = useRef(0);
  const syncInFlight = useRef(false);
  const syncPending = useRef(false);

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

  // 3. Protected Sync Logic
  const triggerSync = useCallback(() => {
    if (!conversationId) return;
    if (syncInFlight.current) {
      syncPending.current = true;
      return;
    }

    syncInFlight.current = true;
    setIsSyncing(true);

    syncConversation(conversationId)
      .finally(() => {
        syncInFlight.current = false;
        setIsSyncing(false);
        if (syncPending.current) {
          syncPending.current = false;
          triggerSync();
        }
      });
  }, [conversationId]);

  const debouncedSync = useMemo(() => debounce(triggerSync, 150), [triggerSync]);

  // 4. Background Sync & Realtime Trigger
  useEffect(() => {
    if (!conversationId) return;

    // Initial background sync
    triggerSync();

    // Listen for server changes to trigger delta syncs instead of pulling full payloads
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          debouncedSync();
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
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, triggerSync, debouncedSync]);

  const { markConversationNotificationsAsRead } = useNotifications();
  
  // Mark conversation as read when viewing (Local-First)
  useEffect(() => {
    const lastMsg = localMessages?.[localMessages.length - 1];
    if (!conversationId || !userId || !lastMsg?.seq || lastMsg.seq <= lastSyncedSeq.current) return;

    const timer = setTimeout(async () => {
      // Update the ref immediately to prevent concurrent timeouts from firing
      lastSyncedSeq.current = lastMsg.seq;

      const receipt = {
        user_id: userId,
        conversation_id: conversationId,
        last_read_seq: lastMsg.seq,
        updated_at: new Date().toISOString()
      };

      try {
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

        // 4. Mark related notifications as read on server
        markConversationNotificationsAsRead.mutate(conversationId);
        
        // 5. Optimistic update for conversations list (immediate feedback)
        queryClient.setQueryData(['conversations', userId], (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((conv: any) => 
            conv.conversation_id === conversationId 
              ? { ...conv, unread_count: 0 } 
              : conv
          );
        });
        
        // 6. Still invalidate occasionally for consistency, but not unconditionally inside the effect
        // queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (err) {
        console.error('Failed to mark as read:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [conversationId, userId, localMessages?.length, queryClient]);

  const messagesWithSenders = useMemo(() => {
    return localMessages?.map((msg: any) => ({
      ...msg,
      sender: profileCache[msg.sender_id] ? {
        name: profileCache[msg.sender_id].name,
        username: profileCache[msg.sender_id].username,
        avatar_url: profileCache[msg.sender_id].avatar_url,
        initials: profileCache[msg.sender_id].initials
      } : undefined
    })) || [];
  }, [localMessages, profileCache]);

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

export const useRetryMessage = () => {
  return useMutation({
    mutationFn: async (messageId: string) => {
      const msg = await chatDb.messages.get(messageId);
      if (!msg) throw new Error('Message not found');

      // Add to sync queue if not already there
      const existingQueueItem = await chatDb.sync_queue.get(messageId);
      if (!existingQueueItem) {
        await chatDb.sync_queue.put({
          id: messageId,
          type: 'message_insert',
          payload: {
            id: msg.id,
            conversation_id: msg.conversation_id,
            sender_id: msg.sender_id,
            content: msg.content,
            message_type: msg.message_type,
            attachment_url: msg.attachment_url,
            reply_to_id: msg.reply_to_id,
            created_at: msg.created_at,
            updated_at: msg.updated_at
          },
          created_at: new Date().toISOString(),
          retry_count: 0,
          status: 'pending'
        });
      } else {
        await chatDb.sync_queue.update(messageId, {
          status: 'pending',
          retry_count: 0
        });
      }

      // Update status to pending
      await chatDb.messages.update(messageId, { sync_status: 'pending' });

      // Trigger sync
      processSyncQueue().catch(console.error);
    }
  });
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
        // Mark as sending
        await chatDb.messages.update(messageId, { sync_status: 'sending' });

        const { error } = await supabase
          .from('messages')
          .insert(insertData);

        if (error) {
          console.warn('Server push failed, queuing locally:', error);
          await chatDb.messages.update(messageId, { sync_status: 'failed' }); // Mark as failed
          await chatDb.sync_queue.put({
            id: messageId,
            type: 'message_insert',
            payload: insertData,
            created_at: now,
            retry_count: 0
          });
        } else {
          // Success, upgrade to sent
          await chatDb.messages.update(messageId, { sync_status: 'sent' });
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
