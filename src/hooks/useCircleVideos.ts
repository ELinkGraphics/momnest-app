import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUpload } from '@/contexts/UploadContext';
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
  price: number | null;
  duration: string | null;
  views_count: number;
  created_at: string;
  updated_at: string | null;
  user_has_unlocked?: boolean;
  author: {
    name: string;
    username: string;
    avatar_url: string | null;
    avatar_color: string;
    initials: string;
  };
}
export const useCircleVideos = (circleId: string) => {
  const queryClient = useQueryClient();
  const { addUpload, updateProgress, completeUpload } = useUpload();
  const query = useQuery({
    queryKey: ['circle-videos', circleId],
    queryFn: async (): Promise<CircleVideo[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('circle_videos')
        .select(`
          *,
          profiles:user_id (name, username, avatar_url, avatar_color, initials)
        `)
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Check unlocks for current user
      let unlockedIds: Set<string> = new Set();
      if (user) {
        const { data: unlocks } = await supabase
          .from('video_unlocks')
          .select('video_id')
          .eq('user_id', user.id);
        if (unlocks) {
          unlockedIds = new Set(unlocks.map(u => u.video_id));
        }
      }
      return (data || []).map((v: any) => ({
        id: v.id,
        circle_id: v.circle_id,
        user_id: v.user_id,
        playlist_id: v.playlist_id,
        video_url: v.video_url,
        thumbnail_url: v.thumbnail_url,
        title: v.title,
        description: v.description,
        is_premium: v.is_premium ?? false,
        price: v.price,
        duration: v.duration,
        views_count: v.views_count ?? 0,
        created_at: v.created_at,
        updated_at: v.updated_at,
        user_has_unlocked: unlockedIds.has(v.id) || v.user_id === user?.id,
        author: {
          name: v.profiles?.name || 'Unknown',
          username: v.profiles?.username || '',
          avatar_url: v.profiles?.avatar_url,
          avatar_color: v.profiles?.avatar_color || '#888',
          initials: v.profiles?.initials || '??',
        },
      }));
    },
    enabled: !!circleId,
  });
  const uploadVideo = useMutation({
    mutationFn: async (params: {
      videoFile: File;
      thumbnailFile?: File;
      title: string;
      description?: string;
      isPremium?: boolean;
      price?: number;
      playlistId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const ts = Date.now();
      const uploadId = `video-${circleId}-${ts}`;
      
      // Register upload in global context
      addUpload({
        id: uploadId,
        title: params.title,
        circleId
      });

      try {
        // Upload video to circle-videos bucket using circleId as folder
        const videoPath = `${circleId}/${ts}.mp4`;
        const { error: videoUploadError } = await supabase.storage
          .from('circle-videos')
          .upload(videoPath, params.videoFile, { 
            cacheControl: '3600', 
            upsert: false,
            onUploadProgress: (progress) => {
              const percent = (progress.loaded / progress.total) * 100;
              updateProgress(uploadId, percent);
            }
          });

        if (videoUploadError) {
          console.error('Upload error:', videoUploadError);
          throw videoUploadError;
        }

        const { data: { publicUrl: videoUrl } } = supabase.storage
          .from('circle-videos')
          .getPublicUrl(videoPath);

        // Upload thumbnail if provided (no progress needed for small thumbs)
        let thumbnailUrl: string | null = null;
        if (params.thumbnailFile) {
          const thumbPath = `${circleId}/${ts}_thumb.jpg`;
          const { error: thumbError } = await supabase.storage
            .from('circle-videos')
            .upload(thumbPath, params.thumbnailFile, { cacheControl: '3600', upsert: false });
          
          if (!thumbError) {
            const { data: { publicUrl } } = supabase.storage
              .from('circle-videos')
              .getPublicUrl(thumbPath);
            thumbnailUrl = publicUrl;
          }
        }

        // Insert database record
        const { data, error } = await supabase
          .from('circle_videos')
          .insert({
            circle_id: circleId,
            user_id: user.id,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            title: params.title,
            description: params.description || null,
            is_premium: params.isPremium ?? false,
            price: params.isPremium ? (params.price ?? 50) : null,
            playlist_id: params.playlistId || null,
          })
          .select()
          .single();

        if (error) throw error;
        
        // Finalize success
        completeUpload(uploadId, true);
        return data;
      } catch (error: any) {
        // Finalize error
        completeUpload(uploadId, false, error.message);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Video uploaded successfully!');
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
    },
    onError: (error: any) => {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Failed to upload video');
    },
  });
  const unlockVideo = useMutation({
    mutationFn: async (videoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // Get video price
      const { data: video } = await supabase
        .from('circle_videos')
        .select('price, user_id')
        .eq('id', videoId)
        .single();
      if (!video || !video.price) throw new Error('Video not found or not premium');
      // Use coin transfer
      const { data: success, error } = await supabase.rpc('transfer_coins', {
        _sender_id: user.id,
        _receiver_id: video.user_id,
        _amount: video.price,
        _type_sent: 'tip' as any,
        _type_received: 'tip' as any,
        _reference_id: videoId,
        _description: 'Video unlock',
      });
      if (error) throw error;
      if (!success) throw new Error('Insufficient coins');
      // Record unlock
      const { error: unlockError } = await supabase
        .from('video_unlocks')
        .insert({ video_id: videoId, user_id: user.id, amount_paid: video.price });
      if (unlockError) throw unlockError;
    },
    onSuccess: () => {
      toast.success('Video unlocked!');
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to unlock video');
    },
  });

  const updateVideo = useMutation({
    mutationFn: async (params: {
      id: string;
      title: string;
      description?: string;
      isPremium?: boolean;
      price?: number;
      playlistId?: string | null;
      thumbnailFile?: File;
    }) => {
      let thumbnailUrl = undefined;
      
      if (params.thumbnailFile) {
        const thumbPath = `${circleId}/${Date.now()}_thumb.jpg`;
        const { error: thumbError } = await supabase.storage
          .from('circle-videos')
          .upload(thumbPath, params.thumbnailFile, { cacheControl: '3600', upsert: false });
        
        if (!thumbError) {
          const { data: { publicUrl } } = supabase.storage
            .from('circle-videos')
            .getPublicUrl(thumbPath);
          thumbnailUrl = publicUrl;
        }
      }

      const { data, error } = await supabase
        .from('circle_videos')
        .update({
          title: params.title,
          description: params.description || null,
          is_premium: params.isPremium ?? false,
          price: params.isPremium ? (params.price ?? 50) : null,
          playlist_id: params.playlistId || null,
          ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Video updated!');
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update video');
    }
  });

  const deleteVideo = useMutation({
    mutationFn: async (videoId: string) => {
      const { error } = await supabase
        .from('circle_videos')
        .delete()
        .eq('id', videoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Video deleted');
      queryClient.invalidateQueries({ queryKey: ['circle-videos', circleId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete video');
    }
  });

  return {
    ...query,
    uploadVideo,
    unlockVideo,
    updateVideo,
    deleteVideo,
  };
};