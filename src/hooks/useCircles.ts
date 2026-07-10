import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeFeatures, type CircleFeature } from '@/lib/circleTypes';

export interface Circle {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  is_private: boolean;
  is_premium: boolean;
  is_expert: boolean;
  is_active: boolean;
  creator_id: string;
  created_at: string;
  circle_type: string;
  enabled_features: CircleFeature[];
  target_audience?: string | null;
  member_benefits?: string | null;
  primary_language?: string | null;
  is_online?: boolean;
  about_text?: string | null;
  guidelines?: string[] | null;
  subscription_enabled?: boolean;
  subscription_price?: number;
  subscription_method?: string;
  members_count?: number;
  posts_count?: number;
  videos_count?: number;
  events_count?: number;
  resources_count?: number;
  services_count?: number;
  last_activity_at?: string | null;
  is_joined?: boolean;
  is_owned?: boolean;
  is_admin?: boolean;
  member_role?: string;
  invite_code?: string;
  creator?: {
    name: string;
    avatar_url: string | null;
    username: string;
  };
}

interface MembershipInfo {
  is_joined: boolean;
  member_role: string | null;
}

/** Shared row → Circle mapper so every hook formats circles identically. */
const mapCircleRow = (
  circle: any,
  userId: string | undefined,
  membership: MembershipInfo
): Circle => ({
  id: circle.id,
  name: circle.name,
  description: circle.description,
  category: circle.category,
  location: circle.location,
  avatar_url: circle.avatar_url,
  cover_image_url: circle.cover_image_url,
  is_private: circle.is_private,
  is_premium: circle.is_premium,
  is_expert: circle.is_expert,
  is_active: circle.is_active,
  creator_id: circle.creator_id,
  created_at: circle.created_at,
  // Fallbacks keep older rows (created before the circle-types migration) working
  circle_type: circle.circle_type ?? 'community',
  enabled_features: normalizeFeatures(circle.enabled_features),
  target_audience: circle.target_audience ?? null,
  member_benefits: circle.member_benefits ?? null,
  primary_language: circle.primary_language ?? null,
  is_online: circle.is_online ?? true,
  about_text: circle.about_text,
  guidelines: circle.guidelines,
  subscription_enabled: circle.subscription_enabled ?? false,
  subscription_price: circle.subscription_price ?? 10,
  subscription_method: circle.subscription_method ?? 'after_join',
  members_count: circle.circle_stats?.members_count || 0,
  posts_count: circle.circle_stats?.posts_count || 0,
  videos_count: circle.circle_stats?.videos_count || 0,
  events_count: circle.circle_stats?.events_count || 0,
  resources_count: circle.circle_stats?.resources_count || 0,
  services_count: circle.circle_stats?.services_count || 0,
  last_activity_at: circle.circle_stats?.last_activity_at ?? null,
  is_joined: membership.is_joined,
  is_owned: userId === circle.creator_id,
  is_admin: membership.member_role === 'admin' || membership.member_role === 'creator',
  member_role: membership.member_role || undefined,
  invite_code: circle.invite_code,
  creator: {
    name: circle.profiles?.name || 'Unknown',
    avatar_url: circle.profiles?.avatar_url || null,
    username: circle.profiles?.username || 'unknown',
  },
});

const CIRCLE_SELECT = `
  *,
  circle_stats (*),
  profiles!circles_creator_id_fkey (
    name,
    avatar_url,
    username
  )
`;

export const useCircles = (userId?: string) => {
  return useQuery({
    queryKey: ['circles', userId],
    queryFn: async () => {
      const { data: circles, error } = await supabase
        .from('circles')
        .select(CIRCLE_SELECT)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check membership status and role if user is logged in
      let membershipData: any[] = [];
      if (userId) {
        const { data: memberships } = await supabase
          .from('circle_members')
          .select('circle_id, status, role')
          .eq('user_id', userId)
          .eq('status', 'active');

        membershipData = memberships || [];
      }

      return circles.map((circle: any) =>
        mapCircleRow(circle, userId, {
          is_joined: membershipData.some((m) => m.circle_id === circle.id),
          member_role: membershipData.find((m) => m.circle_id === circle.id)?.role || null,
        })
      );
    },
    enabled: true,
  });
};

export const useCircle = (circleId: string, userId?: string) => {
  return useQuery({
    queryKey: ['circle', circleId, userId],
    queryFn: async () => {
      const { data: circle, error } = await supabase
        .from('circles')
        .select(CIRCLE_SELECT)
        .eq('id', circleId)
        .single();

      if (error) throw error;

      // Check membership status and role if user is logged in
      let isJoined = false;
      let memberRole: string | null = null;
      if (userId) {
        const { data: membership } = await supabase
          .from('circle_members')
          .select('status, role')
          .eq('circle_id', circleId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        isJoined = !!membership;
        memberRole = membership?.role || null;
      }

      return mapCircleRow(circle, userId, { is_joined: isJoined, member_role: memberRole });
    },
    enabled: !!circleId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

const MEMBER_CIRCLE_SELECT = `
  circle_id,
  role,
  circles (${CIRCLE_SELECT})
`;

export const useMyCircles = (userId: string) => {
  return useQuery({
    queryKey: ['my-circles', userId],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('circle_members')
        .select(MEMBER_CIRCLE_SELECT)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      return memberships
        .filter((m: any) => m.circles)
        .map((membership: any) =>
          mapCircleRow(membership.circles, userId, {
            is_joined: true,
            member_role: membership.role,
          })
        );
    },
    enabled: !!userId,
  });
};

export const useOwnedCircles = (userId: string) => {
  return useQuery({
    queryKey: ['owned-circles', userId],
    queryFn: async () => {
      // Fetch circles where user is creator, admin, or moderator
      const { data: memberships, error } = await supabase
        .from('circle_members')
        .select(MEMBER_CIRCLE_SELECT)
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['creator', 'admin']);

      if (error) throw error;

      return (memberships || [])
        .filter((m: any) => m.circles)
        .map((membership: any) =>
          mapCircleRow(membership.circles, userId, {
            is_joined: true,
            member_role: membership.role,
          })
        );
    },
    enabled: !!userId,
  });
};
