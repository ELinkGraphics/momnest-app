import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, Send, MessageCircle, BarChart3, Repeat2, Loader2, ExternalLink, MoreVertical, Trash2, EyeOff, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmojiPicker from '@/components/EmojiPicker';
import { Story, StoryStickerData } from '@/data/mock';
import { useSwipeGestures } from '@/hooks/useSwipeGestures';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVisibilityHandler } from '@/hooks/useVisibilityHandler';
import PublicProfileModal from '@/components/PublicProfileModal';
import StoryActivityModal from '@/components/StoryActivityModal';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ 
  stories, 
  initialIndex, 
  isOpen, 
  onClose,
  onStoryViewed,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [nextStoryIndex, setNextStoryIndex] = useState<number | null>(null);
  const [isImagePreloaded, setIsImagePreloaded] = useState(false);
  
  const [isLiked, setIsLiked] = useState(false);
  const [message, setMessage] = useState('');
  const [isMessageFocused, setIsMessageFocused] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [isResharing, setIsResharing] = useState(false);
  const [isMentionedInStory, setIsMentionedInStory] = useState(false);
  const [storyMentions, setStoryMentions] = useState<Array<{ user_id: string; username: string; name: string }>>([]);
  const [mentionProfileUserId, setMentionProfileUserId] = useState<string | null>(null);
  const [showStoryMenu, setShowStoryMenu] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const viewedStoryIds = useRef<Set<string>>(new Set());
  

  const navigate = useNavigate();
  const { user } = useUser();

  const { triggerHaptic } = useHapticFeedback();
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentStory = stories[currentIndex];
  const nextStory = nextStoryIndex !== null ? stories[nextStoryIndex] : null;

  const isCurrentVideo = currentStory?.mediaType === 'video';
  const STORY_DURATION = isCurrentVideo && videoDuration ? videoDuration * 1000 : 5000;

  const isOwnStory = currentStory?.user?.id === user?.id;
  const currentStoryDbId = typeof currentStory?.id === 'string' ? currentStory.id : null;

  // Record view when story changes
  useEffect(() => {
    const storyId = typeof currentStory?.id === "string" ? currentStory.id : null;
    if (!isOpen || !storyId || !user?.id || isOwnStory || isTransitioning) return;
    
    // Skip if already viewed in this session
    if (viewedStoryIds.current.has(storyId)) {
      onStoryViewed?.(storyId);
      return;
    }

    const controller = new AbortController();
    
    const recordView = async () => {
      try {
        console.log(`[StoryViewer] Recording view for story: ${storyId} by user: ${user.id}`);
        
        const { error } = await supabase
          .from('story_views')
          .insert({ 
            story_id: storyId, 
            viewer_id: user.id
          });

        if (controller.signal.aborted) return;

        if (error) {
          if (error.code === '23505') {
            console.log('[StoryViewer] Story already viewed by this user.');
            viewedStoryIds.current.add(storyId);
            onStoryViewed?.(storyId);
          } else {
            console.error('[StoryViewer] Failed to record story view:', error);
          }
        } else {
          console.log('[StoryViewer] Successfully recorded view.');
          viewedStoryIds.current.add(storyId);
          onStoryViewed?.(storyId);
        }
      } catch (err) {
        console.error('[StoryViewer] Unexpected error recording view:', err);
      }
    };

    recordView();
    
    return () => controller.abort();
  }, [isOpen, currentStory?.id, user?.id, isOwnStory, isTransitioning, onStoryViewed]);

  // Check if user already liked this story
  useEffect(() => {
    if (!currentStoryDbId || !user?.id) return;
    supabase.from('story_likes')
      .select('id')
      .eq('story_id', currentStoryDbId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsLiked(!!data));
  }, [currentStoryDbId, user?.id]);

  // Check if user is mentioned in this story & fetch all mentions
  useEffect(() => {
    if (!currentStoryDbId) {
      setIsMentionedInStory(false);
      setStoryMentions([]);
      return;
    }
    
    // Fetch all mentions for this story
    supabase.from('story_mentions')
      .select('mentioned_user_id')
      .eq('story_id', currentStoryDbId)
      .then(async ({ data }) => {
        if (!data || data.length === 0) {
          setStoryMentions([]);
          setIsMentionedInStory(false);
          return;
        }
        
        // Check if current user is mentioned
        if (user?.id) {
          setIsMentionedInStory(data.some(m => m.mentioned_user_id === user.id) && !isOwnStory);
        }
        
        // Fetch profiles for mentioned users
        const userIds = data.map(m => m.mentioned_user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, username')
          .in('id', userIds);
        
        setStoryMentions(profiles?.map(p => ({
          user_id: p.id,
          username: p.username || p.name || 'User',
          name: p.name || 'User',
        })) || []);
      });
  }, [currentStoryDbId, user?.id, isOwnStory]);

  // Reshare story to own stories
  const handleReshareStory = async () => {
    if (!currentStoryDbId || !user?.id || !currentStory?.image) return;
    setIsResharing(true);
    try {
      const { error } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: currentStory.image,
        media_type: currentStory.mediaType || 'image',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reshared_story_id: currentStoryDbId,
      } as any);
      if (error) throw error;
      toast({ title: "Added to your story!", description: `Reshared from ${currentStory.user.name}` });
    } catch (err) {
      console.error('Reshare error:', err);
      toast({ title: "Failed to reshare", variant: "destructive" });
    } finally {
      setIsResharing(false);
    }
  };

  // Toggle like
  const handleLikeToggle = async () => {
    if (!currentStoryDbId || !user?.id || isLikeLoading) return;

    const willLike = !isLiked;           // capture intent NOW from current closure
    setIsLiked(willLike);                // optimistic UI
    setIsLikeLoading(true);
    triggerHaptic("medium");

    try {
      if (willLike) {
        const { error } = await supabase
          .from("story_likes")
          .insert({ story_id: currentStoryDbId, user_id: user.id });
        if (error && error.code !== "23505") throw error; // ignore duplicate
      } else {
        await supabase.from("story_likes")
          .delete()
          .eq("story_id", currentStoryDbId)
          .eq("user_id", user.id);
      }
    } catch (err) {
      console.error('Like toggle error:', err);
      setIsLiked(!willLike);  // rollback on failure
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setIsLikeLoading(false);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !currentStoryDbId || !user?.id || !currentStory?.user?.id) return;
    const msgText = message.trim();
    setMessage('');
    await supabase.from('story_messages').insert({
      story_id: currentStoryDbId,
      sender_id: user.id,
      receiver_id: currentStory.user.id,
      content: msgText,
    });
    // Resume story after sending
    setIsMessageFocused(false);
    setIsPaused(false);
  };

  // Preload image helper
  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Still resolve on error to not block transition
      img.src = src;
    });
  }, []);

  // Get unique users and group stories by user
  const userGroups = useMemo(() => {
    const userMap = new Map<string, typeof stories>();
    stories.forEach((story, index) => {
      const uid = story.user.id || story.user.name;
      if (!userMap.has(uid)) {
        userMap.set(uid, []);
      }
      userMap.get(uid)!.push({ ...story, originalIndex: index } as any);
    });
    return Array.from(userMap.values());
  }, [stories]);
  
  // Find current user group and story index within that group
  const getCurrentUserContext = useCallback(() => {
    for (let userIndex = 0; userIndex < userGroups.length; userIndex++) {
      const userStories = userGroups[userIndex];
      const storyIndex = userStories.findIndex(story => (story as any).originalIndex === currentIndex);
      if (storyIndex !== -1) {
        return { userIndex, storyIndex, userStories };
      }
    }
    return { userIndex: 0, storyIndex: 0, userStories: userGroups[0] || [] };
  }, [userGroups, currentIndex]);

  const goToNext = useCallback(async () => {
    const { userIndex, storyIndex, userStories } = getCurrentUserContext();
    
    // If there's a next story in the current user's stories
    if (storyIndex < userStories.length - 1) {
      const nextStoryIndex = (userStories[storyIndex + 1] as any).originalIndex;
      setCurrentIndex(nextStoryIndex);
      setProgress(0);
      triggerHaptic('light');
    } 
    // If this is the last story for current user, move to next user
    else if (userIndex < userGroups.length - 1) {
      const nextUserFirstStoryIndex = (userGroups[userIndex + 1][0] as any).originalIndex;
      const nextStoryImage = stories[nextUserFirstStoryIndex].image;
      
      setIsTransitioning(true);
      setTransitionDirection('next');
      setNextStoryIndex(nextUserFirstStoryIndex);
      setIsImagePreloaded(false);
      triggerHaptic('medium');
      
      // Preload the next story image
      try {
        await preloadImage(nextStoryImage);
        setIsImagePreloaded(true);
        
        // Wait a bit for the crossfade to be visible, then complete transition
        setTimeout(() => {
          setCurrentIndex(nextUserFirstStoryIndex);
          setProgress(0);
          
          // Clean up transition state
          setTimeout(() => {
            setIsTransitioning(false);
            setNextStoryIndex(null);
            setIsImagePreloaded(false);
          }, 100);
        }, 200);
      } catch (error) {
        // Fallback: complete transition even if preload fails
        setIsImagePreloaded(true);
        setTimeout(() => {
          setCurrentIndex(nextUserFirstStoryIndex);
          setProgress(0);
          setTimeout(() => {
            setIsTransitioning(false);
            setNextStoryIndex(null);
            setIsImagePreloaded(false);
          }, 100);
        }, 200);
      }
    } 
    // If this is the last story overall, close viewer
    else {
      onClose();
    }
  }, [currentIndex, stories, userGroups, onClose, triggerHaptic, preloadImage]);

  const goToPrevious = useCallback(async () => {
    const { userIndex, storyIndex, userStories } = getCurrentUserContext();
    
    // If there's a previous story in the current user's stories
    if (storyIndex > 0) {
      const prevStoryIndex = (userStories[storyIndex - 1] as any).originalIndex;
      setCurrentIndex(prevStoryIndex);
      setProgress(0);
      triggerHaptic('light');
    } 
    // If this is the first story for current user, move to previous user's last story
    else if (userIndex > 0) {
      const prevUserStories = userGroups[userIndex - 1];
      const prevUserLastStoryIndex = (prevUserStories[prevUserStories.length - 1] as any).originalIndex;
      const prevStoryImage = stories[prevUserLastStoryIndex].image;
      
      setIsTransitioning(true);
      setTransitionDirection('prev');
      setNextStoryIndex(prevUserLastStoryIndex);
      setIsImagePreloaded(false);
      triggerHaptic('medium');
      
      // Preload the previous story image
      try {
        await preloadImage(prevStoryImage);
        setIsImagePreloaded(true);
        
        // Wait a bit for the crossfade to be visible, then complete transition
        setTimeout(() => {
          setCurrentIndex(prevUserLastStoryIndex);
          setProgress(0);
          
          // Clean up transition state
          setTimeout(() => {
            setIsTransitioning(false);
            setNextStoryIndex(null);
            setIsImagePreloaded(false);
          }, 100);
        }, 200);
      } catch (error) {
        // Fallback: complete transition even if preload fails
        setIsImagePreloaded(true);
        setTimeout(() => {
          setCurrentIndex(prevUserLastStoryIndex);
          setProgress(0);
          setTimeout(() => {
            setIsTransitioning(false);
            setNextStoryIndex(null);
            setIsImagePreloaded(false);
          }, 100);
        }, 200);
      }
    }
  }, [currentIndex, stories, userGroups, triggerHaptic, preloadImage]);

  const swipeHandlers = useSwipeGestures({
    onSwipeLeft: goToNext,
    onSwipeRight: goToPrevious,
  });

  // Handle visibility changes (tab switching, etc.)
  useVisibilityHandler({
    onVisibilityChange: (isVisible) => {
      setIsPaused(!isVisible);
    },
  });

  useEffect(() => {
    if (!isOpen || isPaused || isTransitioning) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 100));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, isTransitioning, goToNext]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setProgress(0);
    setVideoDuration(null);
    setIsTransitioning(false);
    setNextStoryIndex(null);
    setIsImagePreloaded(false);
  }, [initialIndex, isOpen]);

  // Pause/play video when isPaused changes
  useEffect(() => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isPaused]);

  // --- Instagram-style hold/tap gesture logic ---
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const touchStartXRef = useRef<number>(0);
  const [isHolding, setIsHolding] = useState(false);
  const [showLinkOverlay, setShowLinkOverlay] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore if interacting with controls (z-30 elements)
    if ((e.target as HTMLElement).closest('[data-story-controls]')) return;
    touchStartXRef.current = e.clientX;
    isHoldingRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      setIsHolding(true);
      setIsPaused(true);
      triggerHaptic('light');
    }, 200);
  }, [triggerHaptic]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-story-controls]')) return;
    // Clear the hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHoldingRef.current) {
      // Was a HOLD → resume story
      isHoldingRef.current = false;
      setIsHolding(false);
      setIsPaused(false);
      return;
    }

    // It was a SHORT TAP — determine zone
    const screenWidth = window.innerWidth;
    const tapX = touchStartXRef.current;
    const leftThreshold = screenWidth * 0.3;

    if (tapX < leftThreshold) {
      // Left 30% → previous
      goToPrevious();
    } else {
      // Right 70% → next
      // But if story has a reshared post or link stickers, show CTA overlay on center tap
      // If reshared post, tap center area to navigate directly
      if (currentStory?.resharedPostId && tapX >= leftThreshold && tapX < screenWidth * 0.7) {
        onClose();
        navigate(`/post/${currentStory.resharedPostId}`);
        return;
      }
      
      const hasActionableContent = currentStory?.stickerData?.some((s: StoryStickerData) => s.infoType === 'link');
      
      if (hasActionableContent && tapX >= leftThreshold && tapX < screenWidth * 0.7) {
        // Center area tap with link stickers → show link overlay
        setShowLinkOverlay(true);
        setIsPaused(true);
        triggerHaptic('light');
      } else {
        goToNext();
      }
    }
  }, [goToNext, goToPrevious, currentStory, triggerHaptic]);

  const handlePointerCancel = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
      setIsPaused(false);
    }
  }, []);

  const handleDeleteStory = async () => {
    if (!currentStoryDbId) return;
    setShowStoryMenu(false);
    try {
      const { error } = await supabase.from('stories').delete().eq('id', currentStoryDbId);
      if (error) throw error;
      toast({ title: 'Story deleted', description: 'Your story has been removed.' });
      triggerHaptic('medium');
      onClose();
    } catch (err) {
      console.error('Delete story error:', err);
      toast({ title: 'Error', description: 'Could not delete story.', variant: 'destructive' });
    }
  };

  const handleHideStory = async () => {
    if (!currentStoryDbId) return;
    setShowStoryMenu(false);
    try {
      // Hide = set expires_at to now so it no longer appears
      const { error } = await supabase.from('stories').update({ expires_at: new Date().toISOString() } as any).eq('id', currentStoryDbId);
      if (error) throw error;
      toast({ title: 'Story hidden', description: 'Your story is now hidden from viewers.' });
      triggerHaptic('medium');
      onClose();
    } catch (err) {
      console.error('Hide story error:', err);
      toast({ title: 'Error', description: 'Could not hide story.', variant: 'destructive' });
    }
  };

  const handleReportStory = async () => {
    if (!currentStoryDbId || !user?.id) return;
    setShowStoryMenu(false);
    try {
      await supabase.from('abuse_reports').insert({
        reporter_user_id: user.id,
        reported_user_id: currentStory.user.id || null,
        report_type: 'story',
        description: `Reported story ID: ${currentStoryDbId}`,
      });
      toast({ title: 'Story reported', description: 'Thank you for your report. We will review it.' });
      triggerHaptic('medium');
    } catch (err) {
      console.error('Report story error:', err);
      toast({ title: 'Error', description: 'Could not submit report.', variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center animate-in fade-in duration-300">
      {/* Progress bars - only show current user's stories */}
      <div className="absolute top-4 left-12 right-4 flex gap-1 z-10">
        {(() => {
          const { userStories, storyIndex } = getCurrentUserContext();
          return userStories.map((_, index) => (
            <div
              key={index}
              className="flex-1 h-1 bg-card/30 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-card"
                style={{
                  width: index < storyIndex ? '100%' : 
                         index === storyIndex ? `${progress}%` : '0%',
                  transition: index === storyIndex ? 'width 100ms linear' : 'none',
                }}
              />
            </div>
          ));
        })()}
      </div>

      {/* Story actions menu (top-left) */}
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={(e) => { e.stopPropagation(); setShowStoryMenu(!showStoryMenu); setIsPaused(true); }}
          className="p-2 text-white hover:bg-card/20 rounded-full transition-colors"
          aria-label="Story options"
        >
          <MoreVertical className="size-5" />
        </button>

        {showStoryMenu && (
          <>
            {/* Backdrop to close menu */}
            <div className="fixed inset-0 z-20" onClick={() => { setShowStoryMenu(false); setIsPaused(false); }} />
            <div className="absolute top-10 left-0 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden min-w-[160px] z-30 shadow-xl">
              {isOwnStory ? (
                <>
                  <button
                    onClick={handleDeleteStory}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-card/10 transition-colors"
                  >
                    <Trash2 className="size-4" />
                    Delete Story
                  </button>
                  <button
                    onClick={handleHideStory}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-card/10 transition-colors"
                  >
                    <EyeOff className="size-4" />
                    Hide Story
                  </button>
                </>
              ) : (
                <button
                  onClick={handleReportStory}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-card/10 transition-colors"
                >
                  <Flag className="size-4" />
                  Report Story
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 p-2 text-white hover:bg-card/20 rounded-full transition-colors"
        aria-label="Close story"
      >
        <X className="size-6" />
      </button>


      {/* Story content */}
      <div
        className="relative w-full h-full flex items-center justify-center bg-black touch-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        {...swipeHandlers}
      >
        {/* Unified Aspect Ratio Container (390:844) */}
        <div 
          className="relative w-full h-full max-w-[calc(100vh*(390/844))] aspect-[390/844] bg-black shadow-2xl flex items-center justify-center overflow-hidden"
          style={{ height: '100dvh' }}
        >
        {/* Current story */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out transform ${
          isTransitioning && isImagePreloaded
            ? (transitionDirection === 'next' ? '-translate-x-full opacity-0' : 'translate-x-full opacity-0')
            : 'translate-x-0 opacity-100'
        }`}>
          {isCurrentVideo ? (
            <>
              {/* Reconstruct canvas layout: gradient background + transformed video */}
              {currentStory.videoTransform ? (
                <div className="w-full h-full relative overflow-hidden"
                  style={{
                    background: currentStory.backgroundGradient
                      ? `linear-gradient(135deg, hsl(${currentStory.backgroundGradient.from}), hsl(${currentStory.backgroundGradient.to}))`
                      : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
                  }}
                >
                  <video
                    ref={videoRef}
                    src={currentStory.image}
                    className="absolute"
                    style={{
                      left: `${(currentStory.videoTransform.x / currentStory.videoTransform.canvasW) * 100}%`,
                      top: `${(currentStory.videoTransform.y / currentStory.videoTransform.canvasH) * 100}%`,
                      transform: `translate(-50%, -50%) scale(${currentStory.videoTransform.scale}) rotate(${currentStory.videoTransform.rotation}deg)`,
                      transformOrigin: 'center center',
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }}
                    autoPlay
                    loop
                    playsInline
                    muted={false}
                    onLoadedMetadata={(e) => {
                      const vid = e.currentTarget;
                      setVideoDuration(vid.duration);
                      if (!isTransitioning) setProgress(0);
                      
                      // Size the video relatively to ensure it fits the safe area
                      const safeW = currentStory.videoTransform!.canvasW - 24;
                      const safeH = currentStory.videoTransform!.canvasH - 24;
                      const fitScale = Math.min(safeW / vid.videoWidth, safeH / vid.videoHeight, 1);
                      
                      vid.style.width = `${(vid.videoWidth * fitScale / currentStory.videoTransform!.canvasW) * 100}%`;
                      vid.style.height = 'auto'; // Maintain aspect ratio
                    }}
                    onError={(e) => console.error('Video playback error:', e)}
                  />
                </div>
              ) : (
                <video
                  ref={videoRef}
                  src={currentStory.image}
                  className="w-full h-full object-contain"
                  autoPlay
                  loop
                  playsInline
                  muted={false}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    setVideoDuration(vid.duration);
                    if (!isTransitioning) setProgress(0);
                  }}
                  onError={(e) => console.error('Video playback error:', e)}
                />
              )}
              {/* Transparent overlay with stickers/text/images baked in */}
              {currentStory.overlayUrl && (
                <img
                  src={currentStory.overlayUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[2]"
                  draggable={false}
                />
              )}
            </>
          ) : (
            <img
              src={currentStory.image}
              alt={`${currentStory.user.name}'s story`}
              className="w-full h-full object-contain"
              onLoad={() => {
                if (!isTransitioning) {
                  setProgress(0);
                }
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Next story (for crossfade transition) */}
        {isTransitioning && nextStory && (
          <div className={`absolute inset-0 transition-all duration-500 ease-in-out transform ${
            isImagePreloaded
              ? 'translate-x-0 opacity-100'
              : (transitionDirection === 'next' ? 'translate-x-full opacity-0' : '-translate-x-full opacity-0')
          }`}>
            {nextStory.mediaType === 'video' ? (
              <video src={nextStory.image} className="w-full h-full object-contain" playsInline muted />
            ) : (
              <img src={nextStory.image} alt={`${nextStory.user.name}'s story`} className="w-full h-full object-contain" draggable={false} />
            )}
          </div>
        )}

        </div> {/* End of Aspect Ratio Container */}

        {/* Clickable link stickers overlay */}
        {currentStory.stickerData && currentStory.stickerData.length > 0 && (
          <div className="absolute inset-0 z-25 pointer-events-none">
            {currentStory.stickerData
              .filter((s: StoryStickerData) => s.infoType === 'link')
              .map((sticker: StoryStickerData, idx: number) => (
                <a
                  key={`link-${idx}`}
                  href={sticker.content.startsWith('http') ? sticker.content : `https://${sticker.content}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/20 backdrop-blur-sm text-white text-xs font-medium hover:bg-card/30 transition-colors border border-white/20"
                  style={{
                    left: `${sticker.x}%`,
                    top: `${sticker.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-3" />
                  <span className="max-w-[150px] truncate">{sticker.content.replace(/^https?:\/\//, '')}</span>
                </a>
              ))}
          </div>
        )}

        {/* CTA / Link overlay triggered by short tap */}
        {showLinkOverlay && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto">
            <div 
              className="fixed inset-0 z-30" 
              onClick={(e) => {
                e.stopPropagation();
                setShowLinkOverlay(false);
                setIsPaused(false);
              }}
            />
            <div className="z-40 bg-card/95 backdrop-blur-md rounded-2xl px-6 py-4 shadow-xl border border-white/20 flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
              <ExternalLink className="size-6 text-primary" />
              <p className="text-sm font-medium text-foreground">Story has links</p>
              {currentStory.stickerData?.filter((s: StoryStickerData) => s.infoType === 'link').map((sticker, idx) => (
                <a
                  key={idx}
                  href={sticker.content.startsWith('http') ? sticker.content : `https://${sticker.content}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-4" />
                  <span className="max-w-[200px] truncate">{sticker.content.replace(/^https?:\/\//, '')}</span>
                </a>
              ))}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLinkOverlay(false);
                  setIsPaused(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Continue viewing
              </button>
            </div>
          </div>
        )}

        {/* Reshared post: tap directly navigates */}

        {/* User info */}
        <div className="absolute bottom-20 left-4 right-4 text-white z-30">
          <div className="flex items-center gap-3">
            <div 
              className="size-10 rounded-full flex items-center justify-center text-white font-medium text-sm overflow-hidden"
              style={{ backgroundColor: currentStory.user.avatarColor }}
            >
              {currentStory.user.avatar ? (
                <img src={currentStory.user.avatar} alt={currentStory.user.name} className="w-full h-full object-cover" />
              ) : (
                currentStory.user.initials
              )}
            </div>
            <div>
              <p 
                className="font-medium cursor-pointer hover:underline relative z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileModal(true);
                }}
              >
                {currentStory.user.name}
              </p>
              <p className="text-sm text-white/80">
                {(() => {
                  const { storyIndex, userStories } = getCurrentUserContext();
                  return `${storyIndex + 1} of ${userStories.length}`;
                })()}
              </p>
            </div>
          </div>
          
          {/* Mentioned users tags */}
          {storyMentions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {storyMentions.map(mention => (
                <button
                  key={mention.user_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMentionProfileUserId(mention.user_id);
                  }}
                  className="px-2.5 py-1 rounded-full bg-card/20 backdrop-blur-sm text-white text-xs font-medium hover:bg-card/30 transition-colors z-30 relative"
                >
                  @{mention.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Like, Comment and Message input - hide for own stories */}
        {!isOwnStory && (
          <div className="absolute bottom-4 left-4 right-4 z-[50] flex items-center gap-2" data-story-controls>
            {/* Like button */}
            <button
              onClick={handleLikeToggle}
              className="p-2 rounded-full hover:bg-card/10 transition-colors shrink-0"
              aria-label={isLiked ? "Unlike story" : "Like story"}
            >
              <Heart 
                className={`size-6 transition-all ${
                  isLiked 
                    ? 'fill-red-500 text-red-500 scale-110' 
                    : 'text-white'
                }`}
              />
            </button>

            {/* Reshare button — visible when user is mentioned in this story */}
            {isMentionedInStory && (
              <button
                onClick={handleReshareStory}
                disabled={isResharing}
                className="p-2 rounded-full hover:bg-card/10 transition-colors shrink-0"
                aria-label="Reshare to your story"
              >
                {isResharing ? (
                  <Loader2 className="size-5 text-white animate-spin" />
                ) : (
                  <Repeat2 className="size-5 text-white" />
                )}
              </button>
            )}

            {/* Message input */}
              <div className="flex-1 flex items-center gap-2 bg-card/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                <EmojiPicker 
                  onEmojiSelect={(emoji) => setMessage(prev => prev + emoji)}
                  variant="compact"
                  triggerClassName="text-white/60 hover:text-white hover:bg-card/10"
                  className="z-[200]"
                />
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Send message..."
                className="flex-1 bg-transparent text-white placeholder:text-white/60 outline-none text-sm"
                onFocus={() => { setIsMessageFocused(true); setIsPaused(true); }}
                onBlur={() => {
                  // Small delay to allow send button click to register
                  setTimeout(() => {
                    setIsMessageFocused(false);
                    setIsPaused(false);
                  }, 150);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              {message && (
                <button
                  onClick={handleSendMessage}
                  className="text-white hover:text-white/80 transition-colors"
                  aria-label="Send message"
                >
                  <Send className="size-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Activity button - only for story owner */}
        {isOwnStory && currentStoryDbId && (
          <div className="absolute bottom-4 left-4 right-4 z-[50] flex justify-center" data-story-controls>
            <button
              onClick={() => {
                setShowActivityModal(true);
                setIsPaused(true);
              }}
              className="flex items-center gap-2 bg-card/15 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/20 text-white hover:bg-card/25 transition-colors"
            >
              <BarChart3 className="size-5" />
              <span className="text-sm font-medium">Activity</span>
            </button>
          </div>
        )}

        {/* Hold indicator — subtle dim overlay, no play button */}
        {isHolding && (
          <div className="absolute inset-0 bg-black/10 pointer-events-none transition-opacity duration-150" />
        )}
      </div>

      <PublicProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userId={currentStory.user.id || ''}
      />

      {/* Profile modal for mentioned users */}
      {mentionProfileUserId && (
        <PublicProfileModal
          isOpen={!!mentionProfileUserId}
          onClose={() => setMentionProfileUserId(null)}
          userId={mentionProfileUserId}
        />
      )}

      {currentStoryDbId && (
        <StoryActivityModal
          isOpen={showActivityModal}
          onClose={() => {
            setShowActivityModal(false);
            setIsPaused(false);
          }}
          storyId={currentStoryDbId}
        />
      )}
    </div>
  );
};

export default StoryViewer;