import { useState, useEffect } from 'react';
import { Story } from '@/data/mock';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';

export const useStoryPersistence = () => {
  const { user } = useUser();
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch stories from Supabase
  const fetchStories = async () => {
    try {
      setIsLoading(true);
      
      // Fetch active stories (not expired) with user profile data
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id,
          media_url,
          media_type,
          sticker_data,
          created_at,
          user_id,
          live_stream_id,
          reshared_post_id,
          profiles:user_id (
            name,
            initials,
            avatar_color,
            avatar_url
          ),
          live_streams:live_stream_id (
            id,
            status,
            title
          )
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out live stories where the stream is no longer live
      const activeData = data?.filter(story => {
        // If it's not a live story, keep it
        if (!story.live_stream_id) return true;
        // If it's a live story, only keep it if the stream is still live
        return story.live_streams?.status === 'live';
      }) || [];

      // Fetch viewed stories for the current user
      let viewedStoryIds: Set<string> = new Set();
      if (user) {
        const { data: viewedData } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id);
        
        if (viewedData) {
          viewedStoryIds = new Set(viewedData.map(v => v.story_id));
        }
      }

      // Transform Supabase data to Story format
      const transformedStories: Story[] = activeData?.map((story: any) => {
        const stickerData = story.sticker_data || [];
        // Extract metadata entries from sticker_data
        const overlayEntry = Array.isArray(stickerData) ? stickerData.find((s: any) => s.type === 'overlay') : null;
        const videoTransformEntry = Array.isArray(stickerData) ? stickerData.find((s: any) => s.type === 'video_transform') : null;
        const bgGradientEntry = Array.isArray(stickerData) ? stickerData.find((s: any) => s.type === 'background_gradient') : null;
        const filteredStickerData = Array.isArray(stickerData) ? stickerData.filter((s: any) => s.type !== 'overlay' && s.type !== 'video_transform' && s.type !== 'background_gradient') : [];

        return {
          id: story.id,
          user: {
            id: story.user_id,
            name: story.profiles?.name || 'Unknown',
            initials: story.profiles?.initials || '??',
            avatarColor: story.profiles?.avatar_color || '#4B164C',
            avatar: story.profiles?.avatar_url,
          },
          image: story.media_url,
          mediaType: story.media_type === 'video' ? 'video' : 'image',
          overlayUrl: overlayEntry?.content || undefined,
          videoTransform: videoTransformEntry ? {
            x: videoTransformEntry.x,
            y: videoTransformEntry.y,
            scale: videoTransformEntry.scale,
            rotation: videoTransformEntry.rotation,
            canvasW: videoTransformEntry.canvasW,
            canvasH: videoTransformEntry.canvasH,
          } : undefined,
          backgroundGradient: bgGradientEntry ? {
            from: bgGradientEntry.from,
            to: bgGradientEntry.to,
          } : undefined,
          isOwn: story.user_id === user?.id,
          isViewed: viewedStoryIds.has(story.id),
          isLive: story.live_streams?.status === 'live',
          liveStreamId: story.live_stream_id,
          stickerData: filteredStickerData.length > 0 ? filteredStickerData : undefined,
          resharedPostId: story.reshared_post_id || undefined,
        };
      }) || [];

      // Group stories by user
      const groupedStories: Story[] = [];
      const userStoriesMap = new Map<string, Story[]>();

      // Separate own stories and others' stories
      const ownStories: Story[] = [];
      const othersStories: Story[] = [];

      transformedStories.forEach(story => {
        if (story.isOwn) {
          ownStories.push(story);
        } else {
          const userId = activeData?.find((s: any) => s.id === story.id)?.user_id;
          if (userId) {
            if (!userStoriesMap.has(userId)) {
              userStoriesMap.set(userId, []);
            }
            userStoriesMap.get(userId)?.push(story);
          }
        }
      });

      // Add user's own story circle at the beginning if user is logged in
      if (user) {
        const yourStoryCircle: Story = {
          id: ownStories.length > 0 ? ownStories[0].id : -1,
          user: {
            id: user.id,
            name: user.name,
            initials: user.initials,
            avatarColor: user.avatarColor || '#E08ED1',
            avatar: user.avatar,
          },
          image: ownStories.length > 0 ? ownStories[0].image : '',
          isOwn: true,
          isViewed: ownStories.length > 0 ? ownStories.every(s => s.isViewed) : true,
          // Store all user's stories in a custom property
          allStories: ownStories.length > 0 ? ownStories : undefined,
        };
        groupedStories.push(yourStoryCircle);
      }

      // Add other users' story circles (first story of each user)
      userStoriesMap.forEach((stories, userId) => {
        if (stories.length > 0) {
          groupedStories.push({
            ...stories[0],
            isViewed: stories.every(s => s.isViewed),
            allStories: stories,
          });
        }
      });

      setStories(groupedStories);
    } catch (error) {
      console.error('Failed to fetch stories:', error);
      // Set "Your story" button even on error if user exists
      if (user) {
        setStories([{
          id: -1,
          user: {
            id: user.id,
            name: user.name,
            initials: user.initials,
            avatarColor: user.avatarColor || '#E08ED1',
            avatar: user.avatar,
          },
          image: '',
          isOwn: true,
        }]);
      } else {
        setStories([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stories on mount and when user changes
  useEffect(() => {
    fetchStories();
  }, [user]);

  // Real-time subscription for story and live stream changes
  useEffect(() => {
    const channel = supabase
      .channel('stories-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          // Refresh stories when any story is added, updated, or deleted
          fetchStories();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams'
        },
        (payload) => {
          // Refresh stories when a live stream ends to remove its story
          if ((payload.new as any).status === 'ended') {
            fetchStories();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Refresh stories function
  const refreshStories = () => {
    fetchStories();
  };

  return [stories, refreshStories, isLoading] as const;
};
