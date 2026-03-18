import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VideoPlaylist {
  id: string;
  circle_id: string;
  user_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  created_at: string;
  video_count?: number;
}

export const useVideoPlaylists = (circleId: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['video-playlists', circleId],
    queryFn: async () => {
      if (!circleId) return [];

      const { data, error } = await supabase
        .from('video_playlists' as any)
        .select(`
          *,
          circle_videos(count)
        `)
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data?.map((p: any) => ({
        ...p,
        video_count: p.circle_videos?.[0]?.count || 0
      })) as VideoPlaylist[];
    },
    enabled: !!circleId,
  });

  const createPlaylist = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      thumbnailFile?: File;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !circleId) throw new Error('Not authenticated');

      let thumbnailUrl = null;
      if (data.thumbnailFile) {
        const ext = data.thumbnailFile.name.split('.').pop();
        const path = `${user.id}/playlists/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('circle-thumbnails')
          .upload(path, data.thumbnailFile);
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('circle-thumbnails')
            .getPublicUrl(path);
          thumbnailUrl = publicUrl;
        }
      }

      const { data: playlist, error } = await supabase
        .from('video_playlists' as any)
        .insert({
          circle_id: circleId,
          user_id: user.id,
          name: data.name,
          description: data.description || null,
          thumbnail_url: thumbnailUrl
        })
        .select()
        .single();

      if (error) throw error;
      return playlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-playlists', circleId] });
      toast.success('Playlist created!');
    },
    onError: (error) => {
      console.error('Playlist creation error:', error);
      toast.error('Failed to create playlist');
    }
  });

  const deletePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('video_playlists' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-playlists', circleId] });
      toast.success('Playlist deleted');
    }
  });

  return {
    ...query,
    createPlaylist,
    deletePlaylist
  };
};
