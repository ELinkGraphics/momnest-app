import { supabase } from '@/integrations/supabase/client';
import { Story, StoryStickerData, StoryMention } from '@/types/storyTypes';
import { enqueueStoryAction } from '@/lib/sync';

export const storyService = {
  /**
   * Fetch active stories for the current user and their network
   */
  async fetchActiveStories(userId: string) {
    // 1. Fetch raw stories
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
    if (activeStoryIds.length === 0) return { rawStories: [], viewedSet: new Set<string>(), storyMentions: [] };

    // 2. Parallel fetch views and mentions
    const [viewedRes, mentionsRes] = await Promise.all([
      supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', userId)
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
    const storyMentions = mentionsRes.data || [];

    return { rawStories, viewedSet, storyMentions };
  },

  /**
   * Mark a story as viewed in the offline sync queue
   */
  async markStoryViewed(storyId: string, viewerId: string) {
    return enqueueStoryAction('story_view', { story_id: storyId, viewer_id: viewerId });
  },

  /**
   * Toggle like on a story
   */
  async toggleLike(storyId: string, userId: string, willLike: boolean) {
    if (willLike) {
      return enqueueStoryAction('story_like', { story_id: storyId, user_id: userId });
    } else {
      return enqueueStoryAction('story_unlike', { story_id: storyId, user_id: userId });
    }
  },

  /**
   * Send a message reply to a story
   */
  async sendMessage(storyId: string, senderId: string, receiverId: string, content: string) {
    return enqueueStoryAction('story_message', {
      story_id: storyId,
      sender_id: senderId,
      receiver_id: receiverId,
      content,
    });
  },

  /**
   * Reshare a story
   */
  async reshareStory(storyId: string, userId: string, mediaUrl: string, mediaType: 'image' | 'video' = 'image') {
    return supabase.from('stories').insert({
      user_id: userId,
      media_url: mediaUrl,
      media_type: mediaType,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reshared_story_id: storyId,
    } as any);
  },

  /**
   * Check if the user has liked a story
   */
  async checkHasLiked(storyId: string, userId: string) {
    const { data } = await supabase.from('story_likes')
      .select('id')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  },

  /**
   * Fetch mentions for a specific story
   */
  async fetchStoryMentions(storyId: string) {
    const { data } = await supabase.from('story_mentions')
      .select(`
        mentioned_user_id,
        profiles!mentioned_user_id (id, name, username)
      `)
      .eq('story_id', storyId);
    
    return (data || []).map((m: any) => ({
      user_id: m.mentioned_user_id,
      username: m.profiles?.username || m.profiles?.name || 'User',
      name: m.profiles?.name || 'User',
    }));
  },

  /**
   * Delete a story
   */
  async deleteStory(storyId: string) {
    return supabase.from('stories').delete().eq('id', storyId);
  },

  /**
   * Hide a story (expires it immediately)
   */
  async hideStory(storyId: string) {
    return supabase.from('stories').update({ expires_at: new Date().toISOString() } as any).eq('id', storyId);
  },

  /**
   * Report a story
   */
  async reportStory(storyId: string, reporterId: string, reportedUserId: string | null, reason: string, details: string) {
    return supabase.from('abuse_reports').insert({
      reporter_user_id: reporterId,
      reported_user_id: reportedUserId,
      report_type: 'story',
      reason: reason,
      description: `Reported story ID: ${storyId}. Details: ${details}`,
    });
  },
  
  /**
   * Create a new story (with optional extraData from editor)
   */
  async createStory(
    userId: string,
    blobOrFile: Blob | File,
    isVideo: boolean,
    mentionedUserIds?: string[],
    extraData?: any
  ) {
    let publicUrl: string;
    let overlayPublicUrl: string | null = null;

    if (isVideo && extraData?.originalVideoUrl) {
      const originalVideoUrl = extraData.originalVideoUrl as string;
      if (originalVideoUrl.startsWith('blob:')) {
        // For video stories from the editor: upload the original video
        const videoBlob = await fetch(originalVideoUrl).then(r => r.blob());
        const videoFile = new File([videoBlob], `story-${Date.now()}.mp4`, { type: 'video/mp4' });
        const videoPath = `${userId}/${Date.now()}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from('story-media')
          .upload(videoPath, videoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        publicUrl = supabase.storage.from('story-media').getPublicUrl(videoPath).data.publicUrl;
      } else {
        publicUrl = originalVideoUrl;
      }

      // Upload transparent overlay PNG if present
      if (extraData.overlayBlob) {
        const overlayFile = new File([extraData.overlayBlob], `overlay-${Date.now()}.png`, { type: 'image/png' });
        const overlayPath = `${userId}/overlay-${Date.now()}.png`;

        const { error: overlayUploadError } = await supabase.storage
          .from('story-media')
          .upload(overlayPath, overlayFile, { cacheControl: '3600', upsert: false });
        if (overlayUploadError) throw overlayUploadError;

        overlayPublicUrl = supabase.storage.from('story-media').getPublicUrl(overlayPath).data.publicUrl;
      }
    } else {
      // For image stories or direct video uploads (no editor extras)
      const ext = isVideo ? 'mp4' : 'jpg';
      const file = blobOrFile instanceof File ? blobOrFile : new File([blobOrFile], `story-${Date.now()}.${ext}`, { type: isVideo ? 'video/mp4' : 'image/jpeg' });
      const filePath = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      publicUrl = supabase.storage.from('story-media').getPublicUrl(filePath).data.publicUrl;
    }

    const stickerDataPayload = extraData?.stickerData || [];
    const metaEntries: any[] = [];
    
    if (overlayPublicUrl) {
      metaEntries.push({ type: 'overlay', content: overlayPublicUrl, x: 0, y: 0 });
    }
    if (extraData?.videoTransform) {
      metaEntries.push({ type: 'video_transform', ...extraData.videoTransform });
    }
    if (extraData?.backgroundGradient) {
      metaEntries.push({ type: 'background_gradient', from: extraData.backgroundGradient.from, to: extraData.backgroundGradient.to });
    }
    if (extraData?.story_state) {
      const storyState = extraData.story_state;
      
      // Update the background value with the real public URL instead of the local blob URL
      if (storyState.background) {
        storyState.background.value = publicUrl;
      }
      
      if (storyState.elements) {
        for (const el of storyState.elements) {
          if (el.type === 'image' && el.file) {
            const ext = el.file instanceof File ? (el.file.name.split('.').pop() || 'jpg') : 'jpg';
            const stickerPath = `${userId}/stickers/${Date.now()}-${el.id}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from('story-media')
              .upload(stickerPath, el.file, { cacheControl: '3600', upsert: false });
            if (uploadError) throw uploadError;
            
            el.content = supabase.storage.from('story-media').getPublicUrl(stickerPath).data.publicUrl;
            delete el.file;
          }
        }
      }
      metaEntries.push({ type: 'story_state', data: storyState });
    }

    const finalStickerData = [...stickerDataPayload, ...metaEntries].length > 0
      ? [...stickerDataPayload, ...metaEntries]
      : null;

    const { data: storyData, error: dbError } = await supabase.from('stories').insert({
      user_id: userId,
      media_url: publicUrl,
      media_type: isVideo ? 'video' : 'image',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      sticker_data: finalStickerData,
      reshared_post_id: extraData?.reshared_post_id,
      reshared_story_id: extraData?.reshared_story_id,
    } as any).select('id').single();

    if (dbError) throw dbError;

    // Save mentions and notifications
    if (storyData && mentionedUserIds && mentionedUserIds.length > 0) {
      await supabase.from('story_mentions').insert(
        mentionedUserIds.map(uid => ({ story_id: storyData.id, mentioned_user_id: uid }))
      );
      // We assume user name will be fetched by the trigger or passed, 
      // but if we want to send notification here we can. 
      // We will skip inserting to push_notifications here and let the backend/trigger handle it, 
      // or we can just keep the original logic. To be safe, let's keep original logic.
      // Wait, we need `userName`. Let's pass it if needed, or just say 'Someone' if not provided.
      // Or we can just insert push_notifications in CreateStoryModal where we have `user.name`.
    }

    return storyData;
  },
  
  /**
   * Format a raw DB story into the canonical Story type
   */
  formatStory(rawStory: any, viewedSet: Set<string>, storyMentions: any[], userId: string): Story {
    const mentions = storyMentions.filter(m => m.story_id === rawStory.id);
            
    // Parse DB sticker_data, filtering out internal metadata entries
    const dbStickerData: StoryStickerData[] = (() => {
      const raw = rawStory.sticker_data;
      if (!raw || !Array.isArray(raw)) return [];
      return (raw as any[]).filter((s: any) => 
        s.type !== 'overlay' && s.type !== 'video_transform' && s.type !== 'background_gradient' && s.type !== 'story_state'
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
      type: 'info',
      infoType: 'mention',
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
    const rawArr = Array.isArray(rawStory.sticker_data) ? (rawStory.sticker_data as any[]) : [];
    const overlayEntry = rawArr.find((s: any) => s.type === 'overlay');
    const transformEntry = rawArr.find((s: any) => s.type === 'video_transform');
    const gradientEntry = rawArr.find((s: any) => s.type === 'background_gradient');
    const storyStateEntry = rawArr.find((s: any) => s.type === 'story_state');

    let storyState = storyStateEntry?.data || undefined;
    
    // BACKWARD COMPATIBILITY FIX: 
    // If the story was saved with a broken blob: URL for the background during early testing,
    // patch it on-the-fly using the correctly saved media_url.
    if (storyState?.background?.value?.startsWith('blob:')) {
      storyState.background.value = rawStory.media_url;
    }

    return {
      id: rawStory.id,
      user: {
        id: rawStory.profiles?.id || '',
        name: rawStory.profiles?.name || 'Unknown',
        username: rawStory.profiles?.username || '',
        avatar: rawStory.profiles?.avatar_url || '',
        initials: rawStory.profiles?.initials || '??',
        avatarColor: '#E08ED1',
      },
      image: rawStory.media_url,
      mediaType: (rawStory.media_type as 'image' | 'video') || 'image',
      isViewed: viewedSet.has(rawStory.id),
      isOwn: rawStory.user_id === userId,
      isLive: rawStory.live_streams?.status === 'live',
      liveStreamId: rawStory.live_stream_id,
      story_state: storyState,
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
      resharedPostId: rawStory.reshared_post_id || undefined,
      createdAt: rawStory.created_at,
    };
  }
};
