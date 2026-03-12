import { useState, useEffect, useCallback } from 'react';
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

  const fetchActivity = useCallback(async () => {
    if (!storyId || !user?.id) return;

    try {
      // Fetch views with profiles
      const { data: views } = await supabase
        .from('story_views')
        .select(`
          id,
          viewer_id,
          viewed_at,
          profiles:viewer_id (name, initials, avatar_color, avatar_url)
        `)
        .eq('story_id', storyId);

      // Fetch likes
      const { data: likes } = await supabase
        .from('story_likes')
        .select('id, user_id')
        .eq('story_id', storyId);

      // Fetch messages with profiles (both incoming and outgoing)
      const { data: messages } = await supabase
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
        .order('created_at', { ascending: false });

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

  useEffect(() => {
    if (!storyId) return;
    fetchActivity();

    // Realtime subscriptions
    const channel = supabase
      .channel(`story-activity-${storyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_views', filter: `story_id=eq.${storyId}` }, () => fetchActivity())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes', filter: `story_id=eq.${storyId}` }, () => fetchActivity())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_messages', filter: `story_id=eq.${storyId}` }, () => fetchActivity())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storyId, fetchActivity]);

  // Send a reply message in chat
  const sendReply = useCallback(async (receiverId: string, content: string) => {
    if (!storyId || !user?.id) return;
    await supabase.from('story_messages').insert({
      story_id: storyId,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    });
  }, [storyId, user?.id]);

  return { ...data, sendReply, refetch: fetchActivity };
};
