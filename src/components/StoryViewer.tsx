import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Heart, Send, BarChart3, Repeat2, Loader2, ExternalLink, MoreVertical, Trash2, EyeOff, Flag, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmojiPicker from '@/components/EmojiPicker';
import { Story, StoryStickerData } from '@/data/mock';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVisibilityHandler } from '@/hooks/useVisibilityHandler';
import PublicProfileModal from '@/components/PublicProfileModal';
import StoryActivityModal from '@/components/StoryActivityModal';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { enqueueStoryAction } from '@/lib/sync';
import { storyPreloader } from '@/lib/storyPreloader';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
}

// ─── Pause Reason Tracker (BUG-9 FIX) ─────────────────────────────────
type PauseReason = 'hold' | 'menu' | 'input' | 'activity' | 'visibility' | 'link-overlay' | 'profile';

const StoryViewer: React.FC<StoryViewerProps> = ({ 
  stories, 
  initialIndex, 
  isOpen, 
  onClose,
  onStoryViewed,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [nextStoryIndex, setNextStoryIndex] = useState<number | null>(null);
  const [isImagePreloaded, setIsImagePreloaded] = useState(false);
  
  // BUG-9 FIX: Pause reason tracking instead of boolean
  const pauseReasons = useRef(new Set<PauseReason>());
  const [isPaused, setIsPaused] = useState(false);
  
  const addPauseReason = useCallback((reason: PauseReason) => {
    pauseReasons.current.add(reason);
    setIsPaused(true);
  }, []);
  
  const removePauseReason = useCallback((reason: PauseReason) => {
    pauseReasons.current.delete(reason);
    if (pauseReasons.current.size === 0) setIsPaused(false);
  }, []);

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
  // BUG-3 FIX: Clear viewedStoryIds when viewer closes
  const viewedStoryIds = useRef<Set<string>>(new Set());

  // Swipe-down-to-close state
  const [swipeDownY, setSwipeDownY] = useState(0);
  const [isSwipingDown, setIsSwipingDown] = useState(false);
  const swipeStartY = useRef(0);
  const swipeStartX = useRef(0);
  const swipeDirectionLocked = useRef<'horizontal' | 'vertical' | null>(null);

  const navigate = useNavigate();
  const { user } = useUser();
  const { triggerHaptic } = useHapticFeedback();

  // BUG-2 FIX: Track videoDuration separately, reset on story change
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  // BUG-5 FIX: Track transition timeouts for cleanup
  const transitionTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTransitionTimeouts = useCallback(() => {
    transitionTimeouts.current.forEach(clearTimeout);
    transitionTimeouts.current = [];
  }, []);

  const currentStory = stories[currentIndex];
  const nextStory = nextStoryIndex !== null ? stories[nextStoryIndex] : null;

  const isCurrentVideo = currentStory?.mediaType === 'video';
  const STORY_DURATION = isCurrentVideo && videoDuration ? videoDuration * 1000 : 5000;

  const isOwnStory = currentStory?.user?.id === user?.id;
  const currentStoryDbId = typeof currentStory?.id === 'string' ? currentStory.id : null;

  // ─── Record view when story changes ──────────────────────────────────
  useEffect(() => {
    const storyId = typeof currentStory?.id === "string" ? currentStory.id : null;
    if (!isOpen || !storyId || !user?.id || isOwnStory || isTransitioning) return;
    
    if (viewedStoryIds.current.has(storyId)) {
      onStoryViewed?.(storyId);
      return;
    }

    const controller = new AbortController();
    
    const recordView = async () => {
      try {
        await enqueueStoryAction('story_view', { 
          story_id: storyId, 
          viewer_id: user.id
        });
        if (controller.signal.aborted) return;
        viewedStoryIds.current.add(storyId);
        onStoryViewed?.(storyId);
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
    const controller = new AbortController();
    
    supabase.from('story_likes')
      .select('id')
      .eq('story_id', currentStoryDbId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setIsLiked(!!data);
      });
      
    return () => controller.abort();
  }, [currentStoryDbId, user?.id]);

  // Check if user is mentioned in this story & fetch all mentions
  useEffect(() => {
    if (!currentStoryDbId) {
      setIsMentionedInStory(false);
      setStoryMentions([]);
      return;
    }
    
    const controller = new AbortController();
    
    supabase.from('story_mentions')
      .select(`
        mentioned_user_id,
        profiles!mentioned_user_id (id, name, username)
      `)
      .eq('story_id', currentStoryDbId)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        
        if (!data || data.length === 0) {
          setStoryMentions([]);
          setIsMentionedInStory(false);
          return;
        }
        
        if (user?.id) {
          setIsMentionedInStory(data.some((m: any) => m.mentioned_user_id === user.id) && !isOwnStory);
        }
        
        setStoryMentions(data.map((m: any) => ({
          user_id: m.mentioned_user_id,
          username: m.profiles?.username || m.profiles?.name || 'User',
          name: m.profiles?.name || 'User',
        })));
      });
      
    return () => controller.abort();
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

    const willLike = !isLiked;
    setIsLiked(willLike);
    setIsLikeLoading(true);
    triggerHaptic("medium");

    try {
      if (willLike) {
        await enqueueStoryAction('story_like', { story_id: currentStoryDbId, user_id: user.id });
      } else {
        await enqueueStoryAction('story_unlike', { story_id: currentStoryDbId, user_id: user.id });
      }
    } catch (err) {
      console.error('Like toggle error:', err);
      setIsLiked(!willLike);
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
    
    await enqueueStoryAction('story_message', {
      story_id: currentStoryDbId,
      sender_id: user.id,
      receiver_id: currentStory.user.id,
      content: msgText,
    });
    setIsMessageFocused(false);
    removePauseReason('input');
  };

  // Preload image helper
  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
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
  const currentUserContext = useMemo(() => {
    for (let userIndex = 0; userIndex < userGroups.length; userIndex++) {
      const userStories = userGroups[userIndex];
      const storyIndex = userStories.findIndex(story => (story as any).originalIndex === currentIndex);
      if (storyIndex !== -1) {
        return { userIndex, storyIndex, userStories };
      }
    }
    return { userIndex: 0, storyIndex: 0, userStories: userGroups[0] || [] };
  }, [userGroups, currentIndex]);

  // Memoize progress bar config
  const progressBarConfig = useMemo(() => {
    const { userStories, storyIndex } = currentUserContext;
    return userStories.map((_, index) => ({
      isCurrent: index === storyIndex,
      isComplete: index < storyIndex,
    }));
  }, [currentUserContext]);

  // ✅ PRELOADING PIPELINE
  const getAllStoriesAhead = useCallback((count = 3) => {
    const { userIndex, storyIndex } = currentUserContext;
    if (userIndex === -1) return [];

    const ahead: Array<{ image: string; mediaType: 'image' | 'video' }> = [];
    let uIdx = userIndex;
    let sIdx = storyIndex + 1;

    while (ahead.length < count && uIdx < userGroups.length) {
      const uStories = userGroups[uIdx];
      if (sIdx < uStories.length) {
        const s = uStories[sIdx];
        ahead.push({ image: (s as any).image, mediaType: (s as any).mediaType || 'image' });
        sIdx++;
      } else {
        uIdx++;
        sIdx = 0;
      }
    }
    return ahead;
  }, [userGroups, currentUserContext]);

  // Trigger preloading whenever the story or groups change
  useEffect(() => {
    if (!isOpen) return;
    
    const ahead = getAllStoriesAhead(3);
    ahead.forEach(s => storyPreloader.preload(s.image, s.mediaType));
    
    const currentUrl = currentStory?.image;
    const keepUrls = ahead.map(s => s.image);
    if (currentUrl) keepUrls.push(currentUrl);
    storyPreloader.prune(keepUrls);
  }, [currentIndex, stories, userGroups, isOpen, getAllStoriesAhead, currentStory?.image]);

  // ─── Use ref for goToNext to avoid stale closure in rAF (BUG-1 FIX) ─
  const goToNextRef = useRef<() => void>(() => {});

  const goToNext = useCallback(async () => {
    const { userIndex, storyIndex, userStories } = currentUserContext;
    
    // BUG-2 FIX: Reset videoDuration for the next story
    setVideoDuration(null);
    
    if (storyIndex < userStories.length - 1) {
      const nextIdx = (userStories[storyIndex + 1] as any).originalIndex;
      setProgress(0);
      setCurrentIndex(nextIdx);
      triggerHaptic('light');
    } 
    else if (userIndex < userGroups.length - 1) {
      const nextUserFirstStoryIndex = (userGroups[userIndex + 1][0] as any).originalIndex;
      const nextStoryImage = stories[nextUserFirstStoryIndex].image;
      
      setIsTransitioning(true);
      setTransitionDirection('next');
      setNextStoryIndex(nextUserFirstStoryIndex);
      triggerHaptic('medium');
      
      const isReady = storyPreloader.isReady(nextStoryImage);
      setIsImagePreloaded(isReady);
      
      if (!isReady) {
        preloadImage(nextStoryImage).then(() => setIsImagePreloaded(true));
      }

      // BUG-5 FIX: Track timeouts for cleanup
      clearTransitionTimeouts();
      const t1 = setTimeout(() => {
        setProgress(0);
        setCurrentIndex(nextUserFirstStoryIndex);
        
        const t2 = setTimeout(() => {
          setIsTransitioning(false);
          setNextStoryIndex(null);
          setIsImagePreloaded(false);
        }, 100);
        transitionTimeouts.current.push(t2);
      }, 200);
      transitionTimeouts.current.push(t1);
    } 
    else {
      onClose();
    }
  }, [currentIndex, stories, userGroups, onClose, triggerHaptic, preloadImage, currentUserContext, clearTransitionTimeouts]);

  // Keep ref in sync
  useEffect(() => { goToNextRef.current = goToNext; }, [goToNext]);

  const goToPrevious = useCallback(async () => {
    const { userIndex, storyIndex, userStories } = currentUserContext;
    
    // BUG-2 FIX: Reset videoDuration
    setVideoDuration(null);
    
    if (storyIndex > 0) {
      const prevStoryIndex = (userStories[storyIndex - 1] as any).originalIndex;
      setProgress(0);
      setCurrentIndex(prevStoryIndex);
      triggerHaptic('light');
    } 
    else if (userIndex > 0) {
      const prevUserStories = userGroups[userIndex - 1];
      const prevUserLastStoryIndex = (prevUserStories[prevUserStories.length - 1] as any).originalIndex;
      const prevStoryImage = stories[prevUserLastStoryIndex].image;
      
      setIsTransitioning(true);
      setTransitionDirection('prev');
      setNextStoryIndex(prevUserLastStoryIndex);
      triggerHaptic('medium');
      
      const isReady = storyPreloader.isReady(prevStoryImage);
      setIsImagePreloaded(isReady);
      
      if (!isReady) {
        preloadImage(prevStoryImage).then(() => setIsImagePreloaded(true));
      }

      // BUG-5 FIX: Track timeouts for cleanup
      clearTransitionTimeouts();
      const t1 = setTimeout(() => {
        setProgress(0);
        setCurrentIndex(prevUserLastStoryIndex);
        
        const t2 = setTimeout(() => {
          setIsTransitioning(false);
          setNextStoryIndex(null);
          setIsImagePreloaded(false);
        }, 100);
        transitionTimeouts.current.push(t2);
      }, 200);
      transitionTimeouts.current.push(t1);
    }
  }, [currentIndex, stories, userGroups, triggerHaptic, preloadImage, currentUserContext, clearTransitionTimeouts]);

  // Handle visibility changes
  useVisibilityHandler({
    onVisibilityChange: (isVisible) => {
      if (isVisible) removePauseReason('visibility');
      else addPauseReason('visibility');
    },
  });

  // ─── BUG-1 FIX: rAF-based smooth progress (60fps) ─────────────────
  const progressStartTime = useRef<number | null>(null);
  const progressAccumulated = useRef(0);

  useEffect(() => {
    if (!isOpen || isPaused || isTransitioning) {
      // Store accumulated progress when pausing
      progressStartTime.current = null;
      return;
    }

    let rafId: number;
    const duration = STORY_DURATION;
    
    const tick = (timestamp: number) => {
      if (!progressStartTime.current) {
        progressStartTime.current = timestamp;
      }
      
      const elapsed = timestamp - progressStartTime.current;
      const totalProgress = progressAccumulated.current + (elapsed / duration) * 100;
      
      if (totalProgress >= 100) {
        setProgress(100);
        // Use ref to avoid stale closure
        goToNextRef.current();
        return;
      }
      
      setProgress(totalProgress);
      rafId = requestAnimationFrame(tick);
    };
    
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      // Save accumulated progress for when we resume
      if (progressStartTime.current) {
        const now = performance.now();
        const elapsed = now - progressStartTime.current;
        progressAccumulated.current += (elapsed / duration) * 100;
        progressStartTime.current = null;
      }
    };
  }, [isOpen, isPaused, isTransitioning, STORY_DURATION]);

  // Reset progress tracking when story changes
  useEffect(() => {
    progressAccumulated.current = 0;
    progressStartTime.current = null;
    setProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setProgress(0);
    setVideoDuration(null);
    setIsTransitioning(false);
    setNextStoryIndex(null);
    setIsImagePreloaded(false);
    progressAccumulated.current = 0;
    progressStartTime.current = null;
    // BUG-3 FIX: Clear viewed IDs when viewer reopens
    if (!isOpen) {
      viewedStoryIds.current.clear();
    }
  }, [initialIndex, isOpen]);

  // BUG-5 FIX: Clean up transition timeouts on unmount
  useEffect(() => {
    return () => clearTransitionTimeouts();
  }, [clearTransitionTimeouts]);

  // Pause/play video when isPaused changes
  useEffect(() => {
    const v = videoRef.current;
    const bgV = bgVideoRef.current;
    if (v) {
      if (isPaused) {
        v.pause();
        if (bgV) bgV.pause();
      } else {
        v.play().catch(() => {});
        if (bgV) {
          bgV.currentTime = v.currentTime;
          bgV.play().catch(() => {});
        }
      }
    }
  }, [isPaused]);

  // ─── Unified touch/pointer gesture system (BUG-8 FIX) ──────────────
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);
  const [showLinkOverlay, setShowLinkOverlay] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-story-controls]')) return;
    
    swipeStartX.current = e.clientX;
    swipeStartY.current = e.clientY;
    swipeDirectionLocked.current = null;
    
    isHoldingRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      setIsHolding(true);
      addPauseReason('hold');
      triggerHaptic('light');
    }, 200);
  }, [triggerHaptic, addPauseReason]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-story-controls]')) return;
    
    const dx = e.clientX - swipeStartX.current;
    const dy = e.clientY - swipeStartY.current;
    
    // Lock direction after 10px of movement
    if (!swipeDirectionLocked.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      swipeDirectionLocked.current = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      // Cancel hold timer if swiping
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
    
    // Swipe-down-to-close: track vertical movement
    if (swipeDirectionLocked.current === 'vertical' && dy > 0) {
      setSwipeDownY(dy);
      setIsSwipingDown(true);
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-story-controls]')) return;
    
    // Clear the hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // Handle swipe-down-to-close
    if (isSwipingDown) {
      if (swipeDownY > 120) {
        // Threshold reached, close
        onClose();
      }
      setSwipeDownY(0);
      setIsSwipingDown(false);
      swipeDirectionLocked.current = null;
      return;
    }

    // Handle horizontal swipe
    const dx = e.clientX - swipeStartX.current;
    if (swipeDirectionLocked.current === 'horizontal') {
      if (dx < -50) {
        goToNext();
      } else if (dx > 50) {
        goToPrevious();
      }
      swipeDirectionLocked.current = null;
      return;
    }

    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
      removePauseReason('hold');
      return;
    }

    // It was a SHORT TAP — determine zone
    const screenWidth = window.innerWidth;
    const tapX = swipeStartX.current;
    const leftThreshold = screenWidth * 0.3;

    if (tapX < leftThreshold) {
      goToPrevious();
    } else {
      if (currentStory?.resharedPostId && tapX >= leftThreshold && tapX < screenWidth * 0.7) {
        onClose();
        navigate(`/post/${currentStory.resharedPostId}`);
        return;
      }
      
      const hasActionableContent = currentStory?.stickerData?.some((s: StoryStickerData) => s.infoType === 'link');
      
      if (hasActionableContent && tapX >= leftThreshold && tapX < screenWidth * 0.7) {
        setShowLinkOverlay(true);
        addPauseReason('link-overlay');
        triggerHaptic('light');
      } else {
        goToNext();
      }
    }
  }, [goToNext, goToPrevious, currentStory, triggerHaptic, isSwipingDown, swipeDownY, onClose, navigate, addPauseReason, removePauseReason]);

  const handlePointerCancel = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsHolding(false);
      removePauseReason('hold');
    }
    setSwipeDownY(0);
    setIsSwipingDown(false);
    swipeDirectionLocked.current = null;
  }, [removePauseReason]);

  const handleDeleteStory = async () => {
    if (!currentStoryDbId) return;
    setShowStoryMenu(false);
    removePauseReason('menu');
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
    removePauseReason('menu');
    try {
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
    removePauseReason('menu');
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

  // Calculate swipe-down-to-close transform values
  const swipeOpacity = isSwipingDown ? Math.max(0.3, 1 - swipeDownY / 300) : 1;
  const swipeScale = isSwipingDown ? Math.max(0.85, 1 - swipeDownY / 1500) : 1;
  const swipeTranslateY = isSwipingDown ? swipeDownY : 0;

  return (
    <div className="fixed inset-0 z-[100] animate-in fade-in duration-200">
      {/* ─── BLUR BACKGROUND LAYER ────────────────────────────────── */}
      <div className="story-bg-blur">
        {isCurrentVideo ? (
          <video
            ref={bgVideoRef}
            src={currentStory.image}
            className="story-bg-media object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img
            src={currentStory.image}
            alt=""
            className="story-bg-media"
            draggable={false}
          />
        )}
        <div className="story-bg-overlay" />
      </div>

      {/* ─── MAIN STORY CONTAINER (swipe-down-to-close) ────────── */}
      <div
        className="relative w-full h-full flex items-center justify-center touch-none"
        style={{
          transform: `translateY(${swipeTranslateY}px) scale(${swipeScale})`,
          opacity: swipeOpacity,
          transition: isSwipingDown ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.3s ease',
          willChange: 'transform, opacity',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Aspect Ratio Container */}
        <div className="story-content-frame">
          {/* ─── PROGRESS BARS ──────────────────────────────────── */}
          <div className="absolute top-3 left-3 right-3 flex gap-[3px] z-20">
            {progressBarConfig.map((bar, index) => (
              <div
                key={index}
                className="story-progress-track"
              >
                <div
                  className="story-progress-fill"
                  style={{
                    width: bar.isComplete ? '100%' : 
                           bar.isCurrent ? `${progress}%` : '0%',
                    transition: bar.isCurrent ? 'none' : 'none',
                  }}
                />
              </div>
            ))}
          </div>

          {/* ─── TOP HEADER: Menu + User Info + Close ───────────── */}
          <div className="absolute top-7 left-3 right-3 z-30 flex items-center gap-2">
            {/* Menu button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (showStoryMenu) {
                  setShowStoryMenu(false);
                  removePauseReason('menu');
                } else {
                  setShowStoryMenu(true);
                  addPauseReason('menu');
                }
              }}
              className="story-icon-btn"
              data-story-controls
              aria-label="Story options"
            >
              <MoreVertical className="size-5" />
            </button>

            {/* User info */}
            <div className="flex items-center gap-2 flex-1 min-w-0" data-story-controls>
              <div 
                className="size-8 rounded-full flex items-center justify-center text-white font-medium text-xs overflow-hidden shrink-0 ring-2 ring-white/30 cursor-pointer"
                style={{ backgroundColor: currentStory.user.avatarColor }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileModal(true);
                  addPauseReason('profile');
                }}
              >
                {currentStory.user.avatar ? (
                  <img src={currentStory.user.avatar} alt={currentStory.user.name} className="w-full h-full object-cover" />
                ) : (
                  currentStory.user.initials
                )}
              </div>
              <div className="min-w-0">
                <p 
                  className="text-white text-sm font-semibold truncate cursor-pointer hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileModal(true);
                    addPauseReason('profile');
                  }}
                >
                  {currentStory.user.name}
                </p>
                <p className="text-white/60 text-[11px]">
                  {(() => {
                    const created = currentStory.createdAt;
                    if (!created) return '';
                    const diff = Date.now() - new Date(created).getTime();
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor(diff / (1000 * 60));
                    if (hours > 0) return `${hours}h ago`;
                    if (minutes > 0) return `${minutes}m ago`;
                    return 'Just now';
                  })()}
                </p>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="story-icon-btn"
              data-story-controls
              aria-label="Close story"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* ─── Story Menu Dropdown ────────────────────────────── */}
          {showStoryMenu && (
            <>
              <div className="fixed inset-0 z-25" onClick={() => { setShowStoryMenu(false); removePauseReason('menu'); }} />
              <div className="absolute top-14 left-3 z-30 story-dropdown" data-story-controls>
                {isOwnStory ? (
                  <>
                    <button
                      onClick={handleDeleteStory}
                      className="story-dropdown-item text-red-400"
                    >
                      <Trash2 className="size-4" />
                      Delete Story
                    </button>
                    <button
                      onClick={handleHideStory}
                      className="story-dropdown-item text-white"
                    >
                      <EyeOff className="size-4" />
                      Hide Story
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleReportStory}
                    className="story-dropdown-item text-red-400"
                  >
                    <Flag className="size-4" />
                    Report Story
                  </button>
                )}
              </div>
            </>
          )}

          {/* ─── STORY MEDIA CONTENT ───────────────────────────── */}
          <div className={`absolute inset-0 story-media-transition ${
            isTransitioning && isImagePreloaded
              ? (transitionDirection === 'next' ? 'story-exit-left' : 'story-exit-right')
              : ''
          }`}>
            {isCurrentVideo ? (
              <>
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
                      preload="auto"
                      muted={false}
                      onLoadedMetadata={(e) => {
                        const vid = e.currentTarget;
                        setVideoDuration(vid.duration);
                        const safeW = currentStory.videoTransform!.canvasW - 24;
                        const safeH = currentStory.videoTransform!.canvasH - 24;
                        const fitScale = Math.min(safeW / vid.videoWidth, safeH / vid.videoHeight, 1);
                        vid.style.width = `${(vid.videoWidth * fitScale / currentStory.videoTransform!.canvasW) * 100}%`;
                        vid.style.height = 'auto';
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
                    preload="auto"
                    muted={false}
                    onLoadedMetadata={(e) => {
                      const vid = e.currentTarget;
                      setVideoDuration(vid.duration);
                    }}
                    onError={(e) => console.error('Video playback error:', e)}
                  />
                )}
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
                draggable={false}
              />
            )}
          </div>

          {/* Next story preview (for crossfade transition) */}
          {isTransitioning && nextStory && (
            <div className={`absolute inset-0 story-media-transition ${
              isImagePreloaded ? '' : (transitionDirection === 'next' ? 'story-enter-right' : 'story-enter-left')
            }`}>
              {nextStory.mediaType === 'video' ? (
                <video src={nextStory.image} className="w-full h-full object-contain" playsInline muted preload="auto" />
              ) : (
                <img src={nextStory.image} alt={`${nextStory.user.name}'s story`} className="w-full h-full object-contain" draggable={false} />
              )}
            </div>
          )}

          {/* ─── Clickable link stickers ─────────────────────────── */}
          {currentStory.stickerData && currentStory.stickerData.length > 0 && (
            <div className="absolute inset-0 z-[5] pointer-events-none">
              {currentStory.stickerData
                .filter((s: StoryStickerData) => s.infoType === 'link')
                .map((sticker: StoryStickerData, idx: number) => (
                  <a
                    key={`link-${idx}`}
                    href={sticker.content.startsWith('http') ? sticker.content : `https://${sticker.content}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute pointer-events-auto story-sticker-link"
                    style={{
                      left: `${sticker.x}%`,
                      top: `${sticker.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    data-story-controls
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
                  removePauseReason('link-overlay');
                }}
                data-story-controls
              />
              <div className="z-40 story-link-modal animate-in fade-in zoom-in-95 duration-200" data-story-controls>
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
                    removePauseReason('link-overlay');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Continue viewing
                </button>
              </div>
            </div>
          )}

          {/* ─── BOTTOM: User info + Mentions ───────────────────── */}
          <div className="absolute bottom-20 left-3 right-3 z-10">
            {/* Mentioned users tags */}
            {storyMentions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {storyMentions.map(mention => (
                  <button
                    key={mention.user_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMentionProfileUserId(mention.user_id);
                    }}
                    className="story-mention-tag"
                    data-story-controls
                  >
                    @{mention.username}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── BOTTOM BAR: Like, Message, Activity ─────────── */}
          {!isOwnStory && (
            <div className="absolute bottom-3 left-3 right-3 z-[50] flex items-center gap-2" data-story-controls>
              {/* Like button */}
              <button
                onClick={handleLikeToggle}
                className="story-action-btn shrink-0"
                aria-label={isLiked ? "Unlike story" : "Like story"}
              >
                <Heart 
                  className={`size-6 transition-all duration-200 ${
                    isLiked 
                      ? 'fill-red-500 text-red-500 scale-110' 
                      : 'text-white'
                  }`}
                />
              </button>

              {/* Reshare button */}
              {isMentionedInStory && (
                <button
                  onClick={handleReshareStory}
                  disabled={isResharing}
                  className="story-action-btn shrink-0"
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
              <div className="story-message-input">
                <EmojiPicker 
                  onEmojiSelect={(emoji) => setMessage(prev => prev + emoji)}
                  variant="compact"
                  triggerClassName="text-white/60 hover:text-white hover:bg-white/10"
                  className="z-[200]"
                />
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Send message..."
                  className="flex-1 bg-transparent text-white placeholder:text-white/50 outline-none text-sm"
                  onFocus={() => { setIsMessageFocused(true); addPauseReason('input'); }}
                  onBlur={() => {
                    setTimeout(() => {
                      setIsMessageFocused(false);
                      removePauseReason('input');
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
            <div className="absolute bottom-3 left-3 right-3 z-[50] flex justify-center" data-story-controls>
              <button
                onClick={() => {
                  setShowActivityModal(true);
                  addPauseReason('activity');
                }}
                className="story-activity-btn"
              >
                <ChevronUp className="size-4" />
                <BarChart3 className="size-4" />
                <span className="text-sm font-medium">Activity</span>
              </button>
            </div>
          )}

          {/* Hold indicator */}
          {isHolding && (
            <div className="absolute inset-0 bg-black/10 pointer-events-none transition-opacity duration-150 z-[3]" />
          )}

          {/* Swipe down indicator */}
          {isSwipingDown && swipeDownY > 30 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
              <div className="story-swipe-indicator" style={{ opacity: Math.min(1, swipeDownY / 120) }}>
                <ChevronUp className="size-5 text-white rotate-180" />
              </div>
            </div>
          )}

          {/* Gradient overlays for readability */}
          <div className="story-gradient-top" />
          <div className="story-gradient-bottom" />
        </div>
      </div>

      <PublicProfileModal
        isOpen={showProfileModal}
        onClose={() => { setShowProfileModal(false); removePauseReason('profile'); }}
        userId={currentStory.user.id || ''}
      />

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
            removePauseReason('activity');
          }}
          storyId={currentStoryDbId}
        />
      )}
    </div>
  );
};

export default StoryViewer;