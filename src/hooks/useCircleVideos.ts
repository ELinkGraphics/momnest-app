import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CircleVideo {
  id: string;
  circle_id: string;
  user_id: string;
  playlist_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  title: string;
  description: string | null;
  is_premium: boolean;
  price: number;
  duration: string | null;
  views_count: number;
  created_at: string;
  updated_at: string;
  author: {
    name: string;
    username: string;
    avatar_url: string | null;
    initials: string;
    avatar_color: string;
  };
  user_has_unlocked: boolean;
  user_has_tipped: boolean;
  tip_count: number;
}

export const useCircleVideos = (circleId: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['circle-videos', circleId],
    queryFn: async () => {
      if (!circleId) return [];

      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('circle_videos' as any)
        .select(`
          *,
          profiles:user_id (
            name,
            username,
            avatar_url,
            initials,
            avatar_color
          )
        `)
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const videoIds = data?.map(v => v.id) || [];

      const [unlocksData, tipsData] = await Promise.all([
        user ? supabase
          .from('video_unlocks' as any)
          .select('video_id')
          .eq('user_id', user.id)
          .in('video_id', videoIds) : { data: [] },
        supabase
          .from('circle_tips')
          .select('video_id, tipper_id')
          .in('video_id', videoIds)
      ]);

      const userUnlockedVideos = new Set(unlocksData.data?.map((u: any) => u.video_id) || []);
      
      const tipsByVideo: Record<string, { count: number; userTipped: boolean }> = {};
      tipsData.data?.forEach(tip => {
        if (!tip.video_id) return;
        if (!tipsByVideo[tip.video_id]) {
          tipsByVideo[tip.video_id] = { count: 0, userTipped: false };
        }
        tipsByVideo[tip.video_id].count++;
        if (user && tip.tipper_id === user.id) {
          tipsByVideo[tip.video_id].userTipped = true;
        }
      });

      return data?.map(video => ({
        ...video,
        author: {
          name: video.profiles?.name || 'Unknown',
          username: video.profiles?.username || 'unknown',
          avatar_url: video.profiles?.avatar_url || null,
          initials: video.profiles?.initials || '??',
          avatar_color: video.profiles?.avatar_color || '#4B164C',
        },
        user_has_unlocked: userUnlockedVideos.has(video.id),
        tip_count: tipsByVideo[video.id]?.count || 0,
        user_has_tipped: tipsByVideo[video.id]?.userTipped || false,
      })) as CircleVideo[];
    },
    enabled: !!circleId,
  });

  const uploadVideo = useMutation({
    mutationFn: async (data: {
      videoFile: File;
      thumbnailFile?: File;
      title: string;
      description?: string;
      isPremium: boolean;
      price: number;
      playlistId?: string;
      duration?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !circleId) throw new Error('Not authenticated');

      // Upload video
      const videoExt = data.videoFile.name.split('.').pop();
      const videoPath = `${user.id}/${Date.now()}.${videoExt}`;
      const { error: videoError } = await supabase.storage
        .from('circle-videos')
        .upload(videoPath, data.videoFile);

      if (videoError) throw videoError;

      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('circle-videos')
        .getPublicUrl(videoPath);

      // Upload thumbnail
      let thumbnailUrl = null;
      if (data.thumbnailFile) {
        const thumbExt = data.thumbnailFile.name.split('.').pop();
        const thumbPath = `${user.id}/${Date.now()}_thumb.${thumbExt}`;
        const { error: thumbError } = await supabase.storage
          .from('circle-thumbnails')
          .upload(thumbPath, data.thumbnailFile);
        
        if (!thumbError) {
          const { data: { publicUrl } } = supabase.storage
            .from('circle-thumbnails')
            .getPublicUrl(thumbPath);
          thumbnailUrl = publicUrl;
        }
      }

      const { data: video, error } = await supabase
        .from('circle_videos' as any)
        .insert({
          circle_id: circleId,
          user_id: user.id,
          playlist_id: data.playlistId || null,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          title: data.title,
          description: data.description || null,
          is_premium: data.isPremium,
          price: data.price,
          duration: data.duration || null,
        })
        .select()
        .single();

      if (error) throw error;
      return video;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
      toast.success('Video uploaded successfully!');
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast.error('Failed to upload video');
    }
  });

  const unlockVideo = useMutation({
    mutationFn: async (videoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: video } = await supabase
        .from('circle_videos' as any)
        .select('price')
        .eq('id', videoId)
        .single();

      if (!video) throw new Error('Video not found');

      const { error } = await supabase
        .from('video_unlocks' as any)
        .insert({
          video_id: videoId,
          user_id: user.id,
          amount_paid: video.price
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
      toast.success('Video unlocked!');
    },
    onError: (error) => {
      console.error('Unlock error:', error);
      toast.error('Failed to unlock video');
    }
  });

  return {
    ...query,
    uploadVideo,
    unlockVideo
  };
};
