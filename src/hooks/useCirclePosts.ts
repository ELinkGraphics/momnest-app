import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CirclePost {
  id: string;
  content: string;
  cover_image_url: string | null;
  is_premium: boolean;
  premium_price: number | null;
  has_tips_enabled: boolean;
  created_at: string;
  user_id: string;
  circle_id: string;
  author: {
    name: string;
    username: string;
    avatar_url: string | null;
    initials: string;
    avatar_color: string;
  };
  stats: {
    likes_count: number;
    comments_count: number;
    shares_count: number;
  };
  user_has_liked: boolean;
  user_reaction: string | null;
  user_has_unlocked: boolean;
  tip_count: number;
  user_has_tipped: boolean;
}

export const useCirclePosts = (circleId: string | undefined) => {
  return useQuery({
    queryKey: ['circle-posts', circleId],
    queryFn: async () => {
      if (!circleId) return [];

      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          cover_image_url,
          is_premium,
          has_tips_enabled,
          premium_price,
          created_at,
          user_id,
          circle_id,
          profiles:user_id (
            name,
            username,
            avatar_url,
            initials,
            avatar_color
          ),
          post_stats (
            likes_count,
            comments_count,
            shares_count
          )
        `)
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user interactions
      const postIds = data?.map(p => p.id) || [];
      
      const [likesData, tipsData, unlocksData] = await Promise.all([
        user ? supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds) : { data: [] },
        supabase
          .from('circle_tips')
          .select('post_id, tipper_id')
          .in('post_id', postIds),
        user ? supabase
          .from('post_unlocks')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds) : { data: [] },
      ]);

      const userLikes = new Map<string, string | null>((likesData.data || []).map(l => [l.post_id as string, l.reaction_type as string | null]));
      const userUnlockedPosts = new Set(unlocksData.data?.map(u => u.post_id) || []);
      
      // Count tips per post and check if user tipped
      const tipsByPost: Record<string, { count: number; userTipped: boolean }> = {};
      tipsData.data?.forEach(tip => {
        if (!tipsByPost[tip.post_id]) {
          tipsByPost[tip.post_id] = { count: 0, userTipped: false };
        }
        tipsByPost[tip.post_id].count++;
        if (user && tip.tipper_id === user.id) {
          tipsByPost[tip.post_id].userTipped = true;
        }
      });

      return data?.map(post => ({
        id: post.id,
        content: post.content,
        cover_image_url: post.cover_image_url,
        is_premium: post.is_premium || false,
        premium_price: post.premium_price ?? null,
        has_tips_enabled: post.has_tips_enabled ?? true,
        created_at: post.created_at,
        user_id: post.user_id,
        circle_id: post.circle_id!,
        author: {
          name: post.profiles?.name || 'Unknown',
          username: post.profiles?.username || 'unknown',
          avatar_url: post.profiles?.avatar_url || null,
          initials: post.profiles?.initials || '??',
          avatar_color: post.profiles?.avatar_color || '#4B164C',
        },
        stats: {
          likes_count: (post.post_stats as any)?.likes_count || 0,
          comments_count: (post.post_stats as any)?.comments_count || 0,
          shares_count: (post.post_stats as any)?.shares_count || 0,
        },
        user_has_liked: userLikes.has(post.id),
        user_reaction: userLikes.get(post.id) || null,
        user_has_unlocked: userUnlockedPosts.has(post.id),
        tip_count: tipsByPost[post.id]?.count || 0,
        user_has_tipped: tipsByPost[post.id]?.userTipped || false,
      })) as CirclePost[];
    },
    enabled: !!circleId,
  });
};
