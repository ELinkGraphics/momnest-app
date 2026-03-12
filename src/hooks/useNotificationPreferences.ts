import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationPreferences {
  id?: string;
  user_id: string;
  enabled: boolean;
  sos_alerts: boolean;
  helper_responses: boolean;
  alert_updates: boolean;
  emergency_contact_alerts: boolean;
  max_distance_km: number;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}

export const useNotificationPreferences = (userId?: string) => {
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['notification-preferences', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Return default preferences if none exist
      return data || {
        user_id: userId,
        enabled: true,
        sos_alerts: true,
        helper_responses: true,
        alert_updates: true,
        emergency_contact_alerts: true,
        max_distance_km: 10,
        quiet_hours_start: null,
        quiet_hours_end: null,
      };
    },
    enabled: !!userId,
  });

  const updatePreferences = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      if (!userId) throw new Error('User ID required');

      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          ...prefs,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update preferences: ${error.message}`);
    },
  });

  return {
    preferences,
    isLoading,
    updatePreferences,
  };
};
