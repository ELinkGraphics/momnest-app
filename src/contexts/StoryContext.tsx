import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Story, StoryStickerData } from '@/data/mock';
import { useUser } from './UserContext';

interface StoryContextType {
  stories: Story[];
  isLoading: boolean;
  refreshStories: () => Promise<void>;
  markStoryViewed: (storyId: string, shouldBroadcast?: boolean) => void;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

export const StoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchVersion = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchStories = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return async (silent = false) => {
      if (!user) {
        setStories([]);
        setIsLoading(false);
        return;
      }

      clearTimeout(timer);
      return new Promise<void>((resolve) => {
        timer = setTimeout(async () => {
          const version = ++fetchVersion.current;
          if (!silent) setIsLoading(true);

          try {
            const { data: rawStories, error: storiesError } = await supabase
              .from('stories')
              .select(`
                *,
                profiles:user_id (id, name, username, avatar_url, initials),
                live_streams:live_stream_id (status)
              `)
              .order('created_at', { ascending: false });

            if (storiesError) throw storiesError;

            const { data: viewedData } = await supabase
              .from('story_views')
              .select('story_id')
              .eq('viewer_id', user.id);

            const viewedSet = new Set(viewedData?.map(v => v.story_id) || []);

            const { data: storyMentions } = await supabase
              .from('story_mentions')
              .select(`
                story_id,
                mentioned_user_id,
                profiles:mentioned_user_id (id, name, username)
              `);

            const transformedStories: Story[] = rawStories?.map(story => {
              const mentions = storyMentions?.filter(m => m.story_id === story.id) || [];
              const filteredStickerData: StoryStickerData[] = mentions.map((m: any) => ({
                type: 'info',
                infoType: 'mention',
                content: m.profiles?.username || '',
                mentionUserId: m.mentioned_user_id || '',
                x: 50,
                y: 50,
              }));

              return {
                id: story.id,
                user: {
                  id: story.profiles?.id || '',
                  name: story.profiles?.name || 'Unknown',
                  username: story.profiles?.username || '',
                  avatar: story.profiles?.avatar_url || '',
                  initials: story.profiles?.initials || '??',
                  avatarColor: '#E08ED1', // Default or from profile
                },
                image: story.media_url,
                mediaType: (story.media_type as 'image' | 'video') || 'image',
                isViewed: viewedSet.has(story.id),
                isOwn: story.user_id === user.id,
                isLive: story.live_streams?.status === 'live',
                liveStreamId: story.live_stream_id,
                stickerData: filteredStickerData.length > 0 ? filteredStickerData : undefined,
                resharedPostId: story.reshared_post_id || undefined,
                createdAt: story.created_at,
              };
            }) || [];

            if (fetchVersion.current !== version) return;

            // Grouping and Sorting (ENHANCE-2)
            const userStoriesMap = new Map<string, Story[]>();
            const ownStories: Story[] = [];

            transformedStories.forEach(s => {
              if (s.isOwn) ownStories.push(s);
              else {
                const uid = s.user.id;
                if (!userStoriesMap.has(uid)) userStoriesMap.set(uid, []);
                userStoriesMap.get(uid)?.push(s);
              }
            });

            const grouped: Story[] = [];
            if (user) {
              grouped.push({
                id: ownStories.length > 0 ? ownStories[0].id : -1,
                user: { 
                  id: user.id, 
                  name: user.name, 
                  initials: user.initials, 
                  avatar: user.avatar,
                  avatarColor: user.avatarColor || '#E08ED1' 
                },
                image: ownStories.length > 0 ? ownStories[0].image : '',
                isOwn: true,
                isViewed: ownStories.length > 0 ? ownStories.every(s => s.isViewed) : true,
                allStories: ownStories.length > 0 ? ownStories : undefined,
                createdAt: ownStories.length > 0 ? ownStories[0].createdAt : undefined,
              });
            }

            const sortedPeers = Array.from(userStoriesMap.values()).sort((a, b) => {
              const aV = a.every(s => s.isViewed);
              const bV = b.every(s => s.isViewed);
              if (aV !== bV) return aV ? 1 : -1;
              return Math.max(...b.map(s => new Date(s.createdAt || 0).getTime())) - 
                     Math.max(...a.map(s => new Date(s.createdAt || 0).getTime()));
            });

            sortedPeers.forEach(peerStories => {
              grouped.push({
                ...peerStories[0],
                isViewed: peerStories.every(s => s.isViewed),
                allStories: peerStories,
              });
            });

            setStories(grouped);
          } catch (err) {
            console.error('[StoryProvider] Fetch error:', err);
          } finally {
            if (fetchVersion.current === version) setIsLoading(false);
            resolve();
          }
        }, silent ? 0 : 300);
      });
    };
  }, [user]);

  const markStoryViewed = useCallback((storyId: string, shouldBroadcast = true) => {
    setStories(prev => prev.map(group => {
      if (String(group.id) === String(storyId)) return { ...group, isViewed: true };
      if (group.allStories) {
        const has = group.allStories.some(s => String(s.id) === String(storyId));
        if (has) {
          const updated = group.allStories.map(s => String(s.id) === String(storyId) ? { ...s, isViewed: true } : s);
          return { ...group, isViewed: updated.every(s => s.isViewed), allStories: updated };
        }
      }
      return group;
    }));

    if (shouldBroadcast && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'story_viewed', payload: { storyId } });
    }
  }, []);

  // Hydration and Realtime
  useEffect(() => {
    fetchStories();

    if (!user?.id) return;

    const channel = supabase
      .channel(`user-story-state-${user.id}`)
      .on('broadcast', { event: 'story_viewed' }, ({ payload }) => {
        if (payload?.storyId) markStoryViewed(payload.storyId, false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => fetchStories(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_streams' }, ({ new: n }: any) => {
          if (n.status === 'ended') fetchStories(true);
      })
      .subscribe();

    channelRef.current = channel;

    return () => { channel.unsubscribe(); };
  }, [user?.id, fetchStories, markStoryViewed]);

  const value = useMemo(() => ({
    stories,
    isLoading,
    refreshStories: () => fetchStories(),
    markStoryViewed,
  }), [stories, isLoading, fetchStories, markStoryViewed]);

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
};

export const useStoryContext = () => {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStoryContext must be used within a StoryProvider');
  }
  return context;
};
