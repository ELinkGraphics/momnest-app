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
  // BUG-4 FIX: Use ref for debounce timer to prevent closure leak
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchStories = useCallback(async (silent = false) => {
    if (!user) {
      setStories([]);
      setIsLoading(false);
      return;
    }

    // BUG-4 FIX: Clear previous timer via ref
    clearTimeout(debounceTimer.current);
    return new Promise<void>((resolve) => {
      debounceTimer.current = setTimeout(async () => {
        const version = ++fetchVersion.current;
        if (!silent) setIsLoading(true);

        try {
          // PERF-2 FIX: Fetch stories first, then parallelize views + mentions
          const { data: rawStories, error: storiesError } = await supabase
            .from('stories')
            .select(`
              *,
              profiles:user_id (id, name, username, avatar_url, initials),
              live_streams:live_stream_id (status)
            `)
            .order('created_at', { ascending: false });

          if (storiesError) throw storiesError;

          const activeStoryIds = rawStories?.map(s => s.id) || [];
          
          if (activeStoryIds.length === 0) {
            if (fetchVersion.current === version) {
              // Still show own story placeholder
              const grouped: Story[] = [];
              if (user) {
                grouped.push({
                  id: `own-placeholder-${user.id}`,
                  user: { 
                    id: user.id, 
                    name: user.name, 
                    initials: user.initials, 
                    avatar: user.avatar,
                    avatarColor: user.avatarColor || '#E08ED1' 
                  },
                  image: '',
                  isOwn: true,
                  isViewed: true,
                  createdAt: undefined,
                });
              }
              setStories(grouped);
              setIsLoading(false);
            }
            resolve();
            return;
          }

          // PERF-2 FIX: Parallel fetch of views and mentions
          // BUG-6 FIX: Filter mentions by active story IDs
          const [viewedRes, mentionsRes] = await Promise.all([
            supabase
              .from('story_views')
              .select('story_id')
              .eq('viewer_id', user.id)
              .in('story_id', activeStoryIds),
            supabase
              .from('story_mentions')
              .select(`
                story_id,
                mentioned_user_id,
                profiles!mentioned_user_id (id, name, username)
              `)
              .in('story_id', activeStoryIds),
          ]);

          const viewedSet = new Set(viewedRes.data?.map(v => v.story_id) || []);
          const storyMentions = mentionsRes.data;

          const transformedStories: Story[] = rawStories?.map(story => {
            const mentions = storyMentions?.filter(m => m.story_id === story.id) || [];
            
            // BUG-13 FIX: Merge DB sticker data with computed mention stickers
            // Parse DB sticker_data, filtering out internal metadata entries
            const dbStickerData: StoryStickerData[] = (() => {
              const raw = story.sticker_data;
              if (!raw || !Array.isArray(raw)) return [];
              return (raw as any[]).filter((s: any) => 
                s.type !== 'overlay' && s.type !== 'video_transform' && s.type !== 'background_gradient'
              ).map((s: any) => ({
                type: s.type || 'info',
                content: s.content || '',
                infoType: s.infoType,
                mentionUserId: s.mentionUserId,
                x: s.x ?? 50,
                y: s.y ?? 50,
              }));
            })();

            // Compute mention stickers from DB relations
            const mentionStickers: StoryStickerData[] = mentions.map((m: any) => ({
              type: 'info' as const,
              infoType: 'mention' as const,
              content: m.profiles?.username || '',
              mentionUserId: m.mentioned_user_id || '',
              x: 50,
              y: 50,
            }));

            // Merge: DB stickers first, then mention stickers (no duplicates)
            const existingMentionIds = new Set(dbStickerData.filter(s => s.infoType === 'mention').map(s => s.mentionUserId));
            const newMentionStickers = mentionStickers.filter(s => !existingMentionIds.has(s.mentionUserId));
            const allStickerData = [...dbStickerData, ...newMentionStickers];

            // Extract overlay URL & video transform from raw sticker_data metadata
            const rawArr = Array.isArray(story.sticker_data) ? (story.sticker_data as any[]) : [];
            const overlayEntry = rawArr.find((s: any) => s.type === 'overlay');
            const transformEntry = rawArr.find((s: any) => s.type === 'video_transform');
            const gradientEntry = rawArr.find((s: any) => s.type === 'background_gradient');

            return {
              id: story.id,
              user: {
                id: story.profiles?.id || '',
                name: story.profiles?.name || 'Unknown',
                username: story.profiles?.username || '',
                avatar: story.profiles?.avatar_url || '',
                initials: story.profiles?.initials || '??',
                avatarColor: '#E08ED1',
              },
              image: story.media_url,
              mediaType: (story.media_type as 'image' | 'video') || 'image',
              isViewed: viewedSet.has(story.id),
              isOwn: story.user_id === user.id,
              isLive: story.live_streams?.status === 'live',
              liveStreamId: story.live_stream_id,
              stickerData: allStickerData.length > 0 ? allStickerData : undefined,
              overlayUrl: overlayEntry?.content || undefined,
              videoTransform: transformEntry ? {
                x: transformEntry.x ?? 0,
                y: transformEntry.y ?? 0,
                scale: transformEntry.scale ?? 1,
                rotation: transformEntry.rotation ?? 0,
                canvasW: transformEntry.canvasW ?? 390,
                canvasH: transformEntry.canvasH ?? 844,
              } : undefined,
              backgroundGradient: gradientEntry ? {
                from: gradientEntry.from || '',
                to: gradientEntry.to || '',
              } : undefined,
              resharedPostId: story.reshared_post_id || undefined,
              createdAt: story.created_at,
            };
          }) || [];

          if (fetchVersion.current !== version) {
            resolve();
            return;
          }

          // Grouping and Sorting
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
            // BUG-10 FIX: Use unique placeholder ID instead of -1
            grouped.push({
              id: ownStories.length > 0 ? ownStories[0].id : `own-placeholder-${user.id}`,
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
  }, [user]);

  // BUG-4 FIX: Clean up debounce timer on unmount or user change
  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
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
