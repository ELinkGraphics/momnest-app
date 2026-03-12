import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  about_text?: string | null;
  guidelines?: string[] | null;
  subscription_enabled?: boolean;
  subscription_price?: number;
  subscription_method?: string;
  members_count?: number;
  posts_count?: number;
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

export const useCircles = (userId?: string) => {
  return useQuery({
    queryKey: ['circles', userId],
    queryFn: async () => {
      const { data: circles, error } = await supabase
        .from('circles')
        .select(`
          *,
          circle_stats (
            members_count,
            posts_count
          ),
          profiles!circles_creator_id_fkey (
            name,
            avatar_url,
            username
          )
        `)
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

      const formattedCircles: Circle[] = circles.map((circle: any) => ({
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
        about_text: circle.about_text,
        guidelines: circle.guidelines,
        subscription_enabled: circle.subscription_enabled ?? false,
        subscription_price: circle.subscription_price ?? 10,
        subscription_method: circle.subscription_method ?? 'after_join',
        members_count: circle.circle_stats?.members_count || 0,
        posts_count: circle.circle_stats?.posts_count || 0,
        is_joined: membershipData.some(m => m.circle_id === circle.id),
        is_owned: userId === circle.creator_id,
        is_admin: membershipData.some(m => m.circle_id === circle.id && (m.role === 'admin' || m.role === 'creator')),
        member_role: membershipData.find(m => m.circle_id === circle.id)?.role || null,
        creator: {
          name: circle.profiles?.name || 'Unknown',
          avatar_url: circle.profiles?.avatar_url || null,
          username: circle.profiles?.username || 'unknown',
        },
      }));

      return formattedCircles;
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
        .select(`
          *,
          circle_stats (
            members_count,
            posts_count,
            events_count,
            services_count,
            resources_count
          ),
          profiles!circles_creator_id_fkey (
            name,
            avatar_url,
            username
          )
        `)
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

      const formattedCircle: Circle = {
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
        about_text: circle.about_text,
        guidelines: circle.guidelines,
        subscription_enabled: circle.subscription_enabled ?? false,
        subscription_price: circle.subscription_price ?? 10,
        subscription_method: circle.subscription_method ?? 'after_join',
        members_count: circle.circle_stats?.members_count || 0,
        posts_count: circle.circle_stats?.posts_count || 0,
        is_joined: isJoined,
        is_owned: userId === circle.creator_id,
        is_admin: memberRole === 'admin' || memberRole === 'creator',
        member_role: memberRole,
        invite_code: circle.invite_code,
        creator: {
          name: circle.profiles?.name || 'Unknown',
          avatar_url: circle.profiles?.avatar_url || null,
          username: circle.profiles?.username || 'unknown',
        },
      };

      return formattedCircle;
    },
    enabled: !!circleId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

export const useMyCircles = (userId: string) => {
  return useQuery({
    queryKey: ['my-circles', userId],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('circle_members')
        .select(`
          circle_id,
          role,
          circles (
            *,
            circle_stats (
              members_count,
              posts_count
            ),
            profiles!circles_creator_id_fkey (
              name,
              avatar_url,
              username
            )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      const formattedCircles: Circle[] = memberships
        .filter(m => m.circles)
        .map((membership: any) => {
          const circle = membership.circles;
          return {
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
            about_text: circle.about_text,
            guidelines: circle.guidelines,
            subscription_enabled: circle.subscription_enabled ?? false,
            subscription_price: circle.subscription_price ?? 10,
            subscription_method: circle.subscription_method ?? 'after_join',
            members_count: circle.circle_stats?.members_count || 0,
            posts_count: circle.circle_stats?.posts_count || 0,
            is_joined: true,
            is_owned: userId === circle.creator_id,
            is_admin: membership.role === 'admin' || membership.role === 'creator',
            member_role: membership.role,
            creator: {
              name: circle.profiles?.name || 'Unknown',
              avatar_url: circle.profiles?.avatar_url || null,
              username: circle.profiles?.username || 'unknown',
            },
          };
        });

      return formattedCircles;
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
        .select(`
          circle_id,
          role,
          circles (
            *,
            circle_stats (
              members_count,
              posts_count
            ),
            profiles!circles_creator_id_fkey (
              name,
              avatar_url,
              username
            )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('role', ['creator', 'admin']);

      if (error) throw error;

      const formattedCircles: Circle[] = (memberships || [])
        .filter(m => m.circles)
        .map((membership: any) => {
          const circle = membership.circles;
          return {
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
            about_text: circle.about_text,
            guidelines: circle.guidelines,
            subscription_enabled: circle.subscription_enabled ?? false,
            subscription_price: circle.subscription_price ?? 10,
            subscription_method: circle.subscription_method ?? 'after_join',
            members_count: circle.circle_stats?.members_count || 0,
            posts_count: circle.circle_stats?.posts_count || 0,
            is_joined: true,
            is_owned: userId === circle.creator_id,
            is_admin: membership.role === 'admin' || membership.role === 'creator',
            member_role: membership.role,
            creator: {
              name: circle.profiles?.name || 'Unknown',
              avatar_url: circle.profiles?.avatar_url || null,
              username: circle.profiles?.username || 'unknown',
            },
          };
        });

      return formattedCircles;
    },
    enabled: !!userId,
  });
};
