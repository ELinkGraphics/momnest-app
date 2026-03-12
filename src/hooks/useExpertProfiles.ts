import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useExpertProfiles = (limit = 5) => {
  return useQuery({
    queryKey: ['expertProfiles', limit],
    queryFn: async () => {
      const sb = supabase as any;

      // Fetch core expert profiles first (must succeed)
      const { data, error } = await sb
        .from('expert_profiles')
        .select('*')
        .eq('is_verified', true)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching expert profiles:', error);
        throw error;
      }

      if (!data || data.length === 0) return [];

      // Fetch profiles separately to avoid PostgREST FK cache issues
      const userIds = data.map((e: any) => e.user_id).filter(Boolean);
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await sb
          .from('profiles')
          .select('id, username, name, avatar_url, initials, avatar_color')
          .in('id', userIds);

        if (profilesError) {
          console.warn('Error fetching expert user profiles:', profilesError);
        }
        if (profiles) {
          profiles.forEach((p: any) => { profilesMap[p.id] = p; });
        }
      }

      // Attach profiles to expert data
      data.forEach((expert: any) => {
        expert.profiles = profilesMap[expert.user_id] || null;
      });

      const answerIds = data
        .filter((e: any) => e.featured_answer_id)
        .map((e: any) => e.featured_answer_id);

      let answersMap: Record<string, any> = {};
      if (answerIds.length > 0) {
        const { data: answers, error: answersError } = await sb
          .from('answers')
          .select('id, answer, question_id, created_at')
          .in('id', answerIds);

        if (answersError) {
          console.warn('Error fetching expert answers:', answersError);
        }

        if (answers) {
          const questionIds = answers.map((a: any) => a.question_id).filter(Boolean);
          const questionsMap: Record<string, string> = {};

          if (questionIds.length > 0) {
            const { data: questions, error: questionsError } = await sb
              .from('questions')
              .select('id, question')
              .in('id', questionIds);

            if (questionsError) {
              console.warn('Error fetching answer questions:', questionsError);
            }

            if (questions) {
              questions.forEach((q: any) => {
                questionsMap[q.id] = q.question;
              });
            }
          }

          answers.forEach((a: any) => {
            answersMap[a.id] = {
              ...a,
              questions: { question: questionsMap[a.question_id] || null },
            };
          });
        }
      }

      let voteCounts: Record<string, number> = {};
      if (answerIds.length > 0) {
        const { data: votes, error: votesError } = await sb
          .from('answer_votes')
          .select('answer_id')
          .in('answer_id', answerIds);

        if (votesError) {
          console.warn('Error fetching answer votes:', votesError);
        }

        if (votes) {
          votes.forEach((v: any) => {
            voteCounts[v.answer_id] = (voteCounts[v.answer_id] || 0) + 1;
          });
        }
      }

      const enriched = data.map((expert: any) => {
        const featuredAnswer = expert.featured_answer_id ? (answersMap[expert.featured_answer_id] || null) : null;
        const answerLikes = expert.featured_answer_id ? (voteCounts[expert.featured_answer_id] || 0) : 0;
        const recencySource = featuredAnswer?.created_at || expert.updated_at || expert.created_at || null;

        return {
          ...expert,
          featured_answer: featuredAnswer,
          answer_likes: answerLikes,
          recency_score: recencySource ? new Date(recencySource).getTime() : 0,
        };
      });

      enriched.sort((a: any, b: any) => {
        if (b.answer_likes !== a.answer_likes) return b.answer_likes - a.answer_likes;
        return (b.recency_score || 0) - (a.recency_score || 0);
      });
      return enriched;
    },
    retry: 2,
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
};

export const useIsExpert = (userId?: string) => {
  return useQuery({
    queryKey: ['isExpert', userId],
    queryFn: async () => {
      const uid = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return false;

      const sb = supabase as any;
      const { data } = await sb
        .from('expert_profiles')
        .select('is_verified')
        .eq('user_id', uid)
        .single();

      return data?.is_verified || false;
    },
    enabled: userId !== undefined ? !!userId : true,
  });
};

// Hook to check if a list of user IDs are experts (for batch checking in feeds)
export const useExpertUserIds = () => {
  return useQuery({
    queryKey: ['expertUserIds'],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from('expert_profiles')
        .select('user_id')
        .eq('is_verified', true);

      if (error) throw error;
      return new Set((data || []).map((e: any) => e.user_id));
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
