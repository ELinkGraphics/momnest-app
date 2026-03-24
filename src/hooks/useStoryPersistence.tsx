import { useState, useEffect, useCallback, useRef } from 'react';
import { Story } from '@/data/mock';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';

export const useStoryPersistence = () => {
  const { user } = useUser();
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch stories from Supabase
  const fetchVersion = useRef(0);
  const fetchTimer = useRef<any>(null);

  // Internal fetch implementation
  const performFetch = async (silent = false) => {
    const version = ++fetchVersion.current;
    
    try {
      if (!silent) setIsLoading(true);
      
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
      if (fetchVersion.current !== version) return;

      // Filter out live stories where the stream is no longer live
      const activeData = data?.filter(story => {
        if (!story.live_stream_id) return true;
        return story.live_streams?.status === 'live';
      }) || [];

      // Fetch viewed stories for the current user
      let viewedStoryIds: Set<string> = new Set();
      if (user) {
        const { data: viewedData, error: viewsError } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id);
        
        if (viewsError) console.error('[useStoryPersistence] Failed to fetch story views:', viewsError);
        if (fetchVersion.current !== version) return;

        if (viewedData) {
          viewedStoryIds = new Set(viewedData.map(v => v.story_id));
        }
      }

      // Transform Supabase data to Story format
      const transformedStories: Story[] = activeData?.map((story: any) => {
        const stickerData = story.sticker_data || [];
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

      if (fetchVersion.current !== version) return;

      // Group stories by user
      const groupedStories: Story[] = [];
      const userStoriesMap = new Map<string, Story[]>();
      const ownStories: Story[] = [];

      transformedStories.forEach(story => {
        if (story.isOwn) {
          ownStories.push(story);
        } else {
          const userId = story.user.id;
          if (userId) {
            if (!userStoriesMap.has(userId)) userStoriesMap.set(userId, []);
            userStoriesMap.get(userId)?.push(story);
          }
        }
      });

      if (user) {
        groupedStories.push({
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
          allStories: ownStories.length > 0 ? ownStories : undefined,
        });
      }

      userStoriesMap.forEach((userStories) => {
        if (userStories.length > 0) {
          groupedStories.push({
            ...userStories[0],
            isViewed: userStories.every(s => s.isViewed),
            allStories: userStories,
          });
        }
      });

      setStories(groupedStories);
    } catch (error) {
      console.error('Failed to fetch stories:', error);
      if (fetchVersion.current !== version) return;
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
      }
    } finally {
      if (fetchVersion.current === version && !silent) {
        setIsLoading(false);
      }
    }
  };

  // ✅ FIX — debounced fetch with version guard (SYNC-1)
  const fetchStories = useCallback((silent = false) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    
    fetchTimer.current = setTimeout(() => {
      performFetch(silent);
    }, 300);
  }, [user?.id]);

  // Fetch stories on mount and when user changes
  useEffect(() => {
    fetchStories();
  }, [user]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('stories-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => fetchStories(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'story_views' },
        (payload) => {
          if (user && (payload.new as any)?.viewer_id === user.id) {
            fetchStories(true);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_streams' },
        (payload) => {
          if ((payload.new as any).status === 'ended') {
            fetchStories(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const refreshStories = () => {
    fetchStories();
  };

  // ✅ FIX — optimistic local viewed state (SYNC-3)
  const markStoryViewed = useCallback((storyId: string) => {
    setStories(prev => prev.map(group => {
      // 1. Direct match (individual story)
      if (String(group.id) === String(storyId)) {
        return { ...group, isViewed: true };
      }

      // 2. Sub-story match (grouped stories)
      if (group.allStories) {
        const hasStory = group.allStories.some(s => String(s.id) === String(storyId));
        if (hasStory) {
          const updatedAllStories = group.allStories.map(s => 
            String(s.id) === String(storyId) ? { ...s, isViewed: true } : s
          );
          const allViewed = updatedAllStories.every(s => s.isViewed);
          return { 
            ...group, 
            isViewed: allViewed, 
            allStories: updatedAllStories 
          };
        }
      }
      return group;
    }));
  }, []);

  return [stories, refreshStories, isLoading, markStoryViewed] as const;
};
