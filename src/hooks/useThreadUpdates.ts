import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useThreadUpdates = (questionId: string) => {
  return useQuery({
    queryKey: ['threadUpdates', questionId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from('thread_updates')
        .select('*')
        .eq('question_id', questionId)
        .order('update_number', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!questionId,
  });
};

export const useCreateThreadUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData: {
      questionId: string;
      content: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Verify user is the original poster
      const sb = supabase as any;
      const { data: question } = await sb
        .from('questions')
        .select('user_id, is_thread')
        .eq('id', updateData.questionId)
        .single();

      if (!question) {
        throw new Error('Question not found');
      }

      if (!question.is_thread) {
        throw new Error('This is not a thread story');
      }

      if (question?.user_id !== user.id) {
        throw new Error('Only the original poster can add thread updates');
      }

      // Get the next update number
      const { data: existingUpdates } = await sb
        .from('thread_updates')
        .select('update_number')
        .eq('question_id', updateData.questionId)
        .order('update_number', { ascending: false })
        .limit(1);

      const nextUpdateNumber = existingUpdates?.[0]?.update_number ? existingUpdates[0].update_number + 1 : 1;

      const { data, error } = await sb
        .from('thread_updates')
        .insert({
          question_id: updateData.questionId,
          user_id: user.id,
          update_text: updateData.content,
          update_number: nextUpdateNumber,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threadUpdates', variables.questionId] });
      queryClient.invalidateQueries({ queryKey: ['question', variables.questionId] });
      toast.success('Update posted successfully!');
    },
    onError: (error) => {
      console.error('Error creating thread update:', error);
      toast.error('Failed to post update');
    },
  });
};

export const useUpdateThreadUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updateId, questionId, content }: { updateId: string; questionId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const sb = supabase as any;
      const { error } = await sb
        .from('thread_updates')
        .update({ update_text: content })
        .eq('id', updateId)
        .eq('user_id', user.id)
        .eq('question_id', questionId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threadUpdates', variables.questionId] });
      toast.success('Story update edited');
    },
    onError: (error) => {
      console.error('Error updating thread update:', error);
      toast.error('Failed to edit story update');
    },
  });
};

export const useDeleteThreadUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updateId, questionId }: { updateId: string; questionId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const sb = supabase as any;
      const { error } = await sb
        .from('thread_updates')
        .delete()
        .eq('id', updateId)
        .eq('user_id', user.id)
        .eq('question_id', questionId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threadUpdates', variables.questionId] });
      toast.success('Story update deleted');
    },
    onError: (error) => {
      console.error('Error deleting thread update:', error);
      toast.error('Failed to delete story update');
    },
  });
};

export const useThreadUpdateVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updateId, hasVoted, questionId }: { updateId: string; hasVoted: boolean; questionId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (hasVoted) {
        const { error } = await (supabase as any)
          .from('thread_update_votes')
          .delete()
          .eq('thread_update_id', updateId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('thread_update_votes')
          .insert({ thread_update_id: updateId, user_id: user.id });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threadUpdates', variables.questionId] });
      queryClient.invalidateQueries({ queryKey: ['userVotes'] });
    },
  });
};
