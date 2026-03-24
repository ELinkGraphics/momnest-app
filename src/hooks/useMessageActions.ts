import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { chatDb } from '@/lib/db';
import { Message } from './useMessages';

export const useMessageReactions = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  const reactions = useLiveQuery(
    async () => {
      if (!conversationId) return [];
      
      // Step 1: Get all message IDs for this conversation from local DB
      const msgIds = await chatDb.messages
        .where('conversation_id')
        .equals(conversationId)
        .primaryKeys();
        
      if (msgIds.length === 0) return [];

      // Step 2: Fetch reactions for these message IDs from local DB
      return await chatDb.message_reactions
        .where('message_id')
        .anyOf(msgIds)
        .toArray();
    },
    [conversationId],
    []
  );

  const toggleReaction = useMutation({
    mutationFn: async ({ messageId, userId, emoji }: { messageId: string; userId: string; emoji: string }) => {
      // 1. Optimistic update in local Dexie DB for instant feedback
      const existingInDexie = await chatDb.message_reactions
        .where('[message_id+user_id+emoji]')
        .equals([messageId, userId, emoji])
        .first();

      if (existingInDexie) {
        await chatDb.message_reactions.delete(existingInDexie.id);
      } else {
        await chatDb.message_reactions.add({
          id: crypto.randomUUID(),
          message_id: messageId,
          user_id: userId,
          emoji,
          created_at: new Date().toISOString()
        });
      }

      // 2. Persist to Supabase
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
      } else {
        const { error } = await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: userId,
          emoji,
        });
        if (error) throw error;
      }
    }
  });

  return { reactions: reactions || [], toggleReaction };
};

export const useEditMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content, conversationId }: { messageId: string; content: string; conversationId: string }) => {
      const { error } = await supabase
        .from('messages')
        .update({ content, is_edited: true, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Message edited');
    },
    onError: () => toast.error('Failed to edit message'),
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();

  const deleteForMe = useMutation({
    mutationFn: async ({ messageId, userId, conversationId }: { messageId: string; userId: string; conversationId: string }) => {
      const { error } = await supabase.from('message_deletions').insert({
        message_id: messageId,
        user_id: userId,
      });
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Message deleted for you');
    },
  });

  const deleteForEveryone = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { error } = await supabase
        .from('messages')
        .update({ deleted_for_everyone: true, content: 'This message was deleted' })
        .eq('id', messageId);
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Message deleted for everyone');
    },
  });

  return { deleteForMe, deleteForEveryone };
};

export const useForwardMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ content, messageType, attachmentUrl, senderName, targetConversationIds, senderId }: {
      content: string;
      messageType: string;
      attachmentUrl?: string;
      senderName: string;
      targetConversationIds: string[];
      senderId: string;
    }) => {
      const inserts = targetConversationIds.map(convId => ({
        conversation_id: convId,
        sender_id: senderId,
        content,
        message_type: messageType,
        attachment_url: attachmentUrl || null,
        forwarded_from_name: senderName,
      }));

      const { error } = await supabase.from('messages').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Message forwarded');
    },
    onError: () => toast.error('Failed to forward message'),
  });
};

export const usePinnedMessage = (conversationId: string | null, messages: Message[]) => {
  const queryClient = useQueryClient();

  // Fetch pinned message ID from conversation
  const { data: pinnedMessageId } = useQuery({
    queryKey: ['pinned-message', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from('conversations')
        .select('pinned_message_id')
        .eq('id', conversationId)
        .single();
      if (error) return null;
      return data?.pinned_message_id || null;
    },
    enabled: !!conversationId,
  });

  // Resolve pinned message from loaded messages
  const pinnedMessage = useMemo(() => {
    if (!pinnedMessageId || !messages.length) return null;
    const msg = messages.find(m => m.id === pinnedMessageId);
    if (!msg) return null;
    return {
      id: msg.id,
      content: msg.content,
      senderId: msg.sender_id,
      senderName: msg.sender?.name || 'Unknown',
      messageType: (msg as any).message_type || 'text',
      attachmentUrl: (msg as any).attachment_url,
    };
  }, [pinnedMessageId, messages]);

  const pinMutation = useMutation({
    mutationFn: async (messageId: string | null) => {
      if (!conversationId) throw new Error('No conversation');
      const { error } = await supabase
        .from('conversations')
        .update({ pinned_message_id: messageId })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: (_, messageId) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-message', conversationId] });
      toast.success(messageId ? 'Message pinned' : 'Message unpinned');
    },
    onError: () => toast.error('Failed to update pin'),
  });

  return {
    pinnedMessage,
    pinMessage: (messageId: string) => pinMutation.mutate(messageId),
    unpinMessage: () => pinMutation.mutate(null),
  };
};