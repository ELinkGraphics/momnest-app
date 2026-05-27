import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';

interface StoryViewer {
  id: string;
  viewer_id: string;
  viewed_at: string;
  profile?: {
    name: string;
    initials: string;
    avatar_color: string;
    avatar_url: string | null;
  };
  hasLiked?: boolean;
}

interface StoryMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  profile?: {
    name: string;
    initials: string;
    avatar_color: string;
    avatar_url: string | null;
  };
}

interface StoryActivityData {
  viewsCount: number;
  likesCount: number;
  reach: number;
  viewers: StoryViewer[];
  messages: StoryMessage[];
  isLoading: boolean;
}

export const useStoryActivity = (storyId: string | null) => {
  const { user } = useUser();
  const [data, setData] = useState<StoryActivityData>({
    viewsCount: 0,
    likesCount: 0,
    reach: 0,
    viewers: [],
    messages: [],
    isLoading: true,
  });
  
  // PERF-3 FIX: Debounce timer for realtime re-fetches
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchActivity = useCallback(async () => {
    if (!storyId || !user?.id) return;

    try {
      // PERF-2 FIX: Parallelize all three queries
      const [viewsRes, likesRes, messagesRes] = await Promise.all([
        supabase
          .from('story_views')
          .select(`
            id,
            viewer_id,
            viewed_at,
            profiles:viewer_id (name, initials, avatar_color, avatar_url)
          `)
          .eq('story_id', storyId),
        supabase
          .from('story_likes')
          .select('id, user_id')
          .eq('story_id', storyId),
        supabase
          .from('story_messages')
          .select(`
            id,
            sender_id,
            receiver_id,
            content,
            created_at,
            profiles:sender_id (name, initials, avatar_color, avatar_url)
          `)
          .eq('story_id', storyId)
          .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
      ]);

      const views = viewsRes.data;
      const likes = likesRes.data;
      const messages = messagesRes.data;

      const likedUserIds = new Set((likes || []).map((l: any) => l.user_id));

      const formattedViewers: StoryViewer[] = (views || []).map((v: any) => ({
        id: v.id,
        viewer_id: v.viewer_id,
        viewed_at: v.viewed_at,
        profile: v.profiles,
        hasLiked: likedUserIds.has(v.viewer_id),
      }));

      const formattedMessages: StoryMessage[] = (messages || []).map((m: any) => ({
        id: m.id,
        sender_id: m.sender_id,
        receiver_id: m.receiver_id,
        content: m.content,
        created_at: m.created_at,
        profile: m.profiles,
      }));

      setData({
        viewsCount: formattedViewers.length,
        likesCount: likes?.length || 0,
        reach: formattedViewers.length,
        viewers: formattedViewers,
        messages: formattedMessages,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error fetching story activity:', error);
      setData(prev => ({ ...prev, isLoading: false }));
    }
  }, [storyId, user?.id]);

  // PERF-3 FIX: Debounced re-fetch for realtime events
  const debouncedFetch = useCallback(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchActivity();
    }, 300); // 300ms debounce to batch rapid realtime events
  }, [fetchActivity]);

  useEffect(() => {
    if (!storyId) return;
    let isMounted = true;
    
    fetchActivity();

    // Realtime subscriptions with debounced re-fetch
    const channel = supabase
      .channel(`story-activity-${storyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_views', filter: `story_id=eq.${storyId}` }, () => {
        if (isMounted) debouncedFetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes', filter: `story_id=eq.${storyId}` }, () => {
        if (isMounted) debouncedFetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_messages', filter: `story_id=eq.${storyId}` }, () => {
        if (isMounted) debouncedFetch();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [storyId, fetchActivity, debouncedFetch]);

  // Send a reply message in chat
  const sendReply = useCallback(async (receiverId: string, content: string) => {
    if (!storyId || !user?.id) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: StoryMessage = {
      id: tempId,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
      created_at: new Date().toISOString(),
      profile: {
        name: user.name || '',
        initials: user.initials || '',
        avatar_color: user.avatarColor || '',
        avatar_url: user.avatar || null,
      },
    };

    // Optimistically add message
    setData(prev => ({ ...prev, messages: [optimisticMsg, ...prev.messages] }));

    try {
      const { error } = await supabase.from('story_messages').insert({
        story_id: storyId,
        sender_id: user.id,
        receiver_id: receiverId,
        content,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Failed to send reply:', err);
      // Revert on error
      setData(prev => ({
        ...prev,
        messages: prev.messages.filter(m => m.id !== tempId),
      }));
      throw err;
    }
  }, [storyId, user]);

  return { ...data, sendReply, refetch: fetchActivity };
};
