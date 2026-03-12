import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useCircleSubscription = (circleId: string | undefined) => {
  return useQuery({
    queryKey: ['circle-subscription', circleId],
    queryFn: async () => {
      if (!circleId) return null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('circle_subscriptions')
        .select('*')
        .eq('circle_id', circleId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      return data;
    },
    enabled: !!circleId,
  });
};
