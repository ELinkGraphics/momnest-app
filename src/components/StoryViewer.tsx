import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import { Story, StoryStickerData, PauseReason } from '@/types/storyTypes';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVisibilityHandler } from '@/hooks/useVisibilityHandler';
import PublicProfileModal from '@/components/PublicProfileModal';
import StoryActivityModal from '@/components/StoryActivityModal';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { storyPreloader } from '@/lib/storyPreloader';
import { storyService } from '@/services/storyService';
import { StoryProgressBar } from './story/StoryProgressBar';
import { StoryHeader } from './story/StoryHeader';
import { StoryMediaRenderer } from './story/StoryMediaRenderer';
import { StoryInteractiveOverlay } from './story/StoryInteractiveOverlay';
import { StoryLinkOverlay, StoryStickers } from './story/StoryLinkOverlay';
import { StoryBottomBar } from './story/StoryBottomBar';
import { ReportDialog } from '@/components/ReportDialog';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
}

// (PauseReason moved to types)

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
    if (pauseReasons.current.size === 0) {
      setIsPaused(false);
    }
  }, []);

  const [isLiked, setIsLiked] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
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
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const nextBgVideoRef = useRef<HTMLVideoElement>(null);

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


  // ─── BACKGROUND VIDEO SYNC ──────────────────────────────────────────
  useEffect(() => {
    if (!isCurrentVideo || !isOpen || isPaused || isTransitioning) return;
    
    const v = videoRef.current;
    const bgV = bgVideoRef.current;
    if (!v || !bgV) return;

    // Sync playing state and time
    let rafId: number;
    const syncVideos = () => {
      if (Math.abs(bgV.currentTime - v.currentTime) > 0.1) {
        bgV.currentTime = v.currentTime;
      }
      if (v.paused && !bgV.paused) bgV.pause();
      if (!v.paused && bgV.paused) bgV.play().catch(() => {});
      
      rafId = requestAnimationFrame(syncVideos);
    };

    rafId = requestAnimationFrame(syncVideos);
    return () => cancelAnimationFrame(rafId);
  }, [isCurrentVideo, isOpen, isPaused, isTransitioning]);

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
        await storyService.markStoryViewed(storyId, user.id);
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
    
    storyService.checkHasLiked(currentStoryDbId, user.id)
      .then((hasLiked) => {
        if (controller.signal.aborted) return;
        setIsLiked(hasLiked);
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
    
    storyService.fetchStoryMentions(currentStoryDbId)
      .then((mentions) => {
        if (controller.signal.aborted) return;
        
        if (!mentions || mentions.length === 0) {
          setStoryMentions([]);
          setIsMentionedInStory(false);
          return;
        }
        
        if (user?.id) {
          setIsMentionedInStory(mentions.some((m: any) => m.user_id === user.id) && !isOwnStory);
        }
        
        setStoryMentions(mentions);
      });
      
    return () => controller.abort();
  }, [currentStoryDbId, user?.id, isOwnStory]);

  // Reshare story to own stories
  const handleReshareStory = async () => {
    if (!currentStoryDbId || !user?.id || !currentStory?.image) return;
    setIsResharing(true);
    try {
      const { error } = await storyService.reshareStory(currentStoryDbId, user.id, currentStory.image, currentStory.mediaType || 'image');
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
      await storyService.toggleLike(currentStoryDbId, user.id, willLike);
    } catch (err) {
      console.error('Like toggle error:', err);
      setIsLiked(!willLike);
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setIsLikeLoading(false);
    }
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
      const { error } = await storyService.deleteStory(currentStoryDbId);
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
      const { error } = await storyService.hideStory(currentStoryDbId);
      if (error) throw error;
      toast({ title: 'Story hidden', description: 'Your story is now hidden from viewers.' });
      triggerHaptic('medium');
      onClose();
    } catch (err) {
      console.error('Hide story error:', err);
      toast({ title: 'Error', description: 'Could not hide story.', variant: 'destructive' });
    }
  };

  const handleReportStory = async (reason: string, details: string) => {
    if (!currentStoryDbId || !user?.id) return;
    try {
      await storyService.reportStory(currentStoryDbId, user.id, currentStory.user.id || null, reason, details);
      toast({ title: 'Story reported', description: 'Thank you for your report. We will review it.' });
      triggerHaptic('medium');
    } catch (err) {
      console.error('Report story error:', err);
      toast({ title: 'Error', description: 'Could not submit report.', variant: 'destructive' });
    }
  };

  // ─── KEYBOARD SUPPORT ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLButtonElement // Sometimes buttons capture space
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
        case ' ': // spacebar for next
          e.preventDefault();
          goToNext();
          break;
        case 'Escape':
          onClose();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToNext, goToPrevious, onClose]);

  if (!isOpen) return null;

  // Calculate swipe-down-to-close transform values
  const swipeOpacity = isSwipingDown ? Math.max(0.3, 1 - swipeDownY / 300) : 1;
  const swipeScale = isSwipingDown ? Math.max(0.85, 1 - swipeDownY / 1500) : 1;
  const swipeTranslateY = isSwipingDown ? swipeDownY : 0;

  return (
    <div className="fixed inset-0 z-[100] animate-in fade-in duration-200">
      <StoryMediaRenderer 
        story={currentStory} 
        videoRef={videoRef} 
        bgVideoRef={bgVideoRef} 
        setVideoDuration={setVideoDuration} 
      />
      {/* Next story preview */}
      {isTransitioning && nextStory && (
        <StoryMediaRenderer 
          story={nextStory} 
          videoRef={nextVideoRef} 
          bgVideoRef={nextBgVideoRef} 
          setVideoDuration={() => {}} 
          isTransitioning={isTransitioning}
          transitionDirection={transitionDirection}
          isImagePreloaded={isImagePreloaded}
        />
      )}

      <StoryInteractiveOverlay
        onNext={goToNext}
        onPrevious={goToPrevious}
        onClose={onClose}
        onPause={addPauseReason}
        onResume={removePauseReason}
        onSwipeDown={(dy, swiping) => {
          setSwipeDownY(dy);
          setIsSwipingDown(swiping);
        }}
        hasLinkContent={!!currentStory?.stickerData?.some(s => s.infoType === 'link')}
        onShowLinkOverlay={() => {
          setShowLinkOverlay(true);
          addPauseReason('link-overlay');
          triggerHaptic('light');
        }}
        resharedPostId={currentStory?.resharedPostId}
        onNavigateToPost={(postId) => {
          onClose();
          navigate(`/post/${postId}`);
        }}
        swipeTranslateY={swipeTranslateY}
        swipeScale={swipeScale}
        swipeOpacity={swipeOpacity}
        isSwipingDown={isSwipingDown}
        swipeDownY={swipeDownY}
      >
        <StoryProgressBar config={progressBarConfig} progress={progress} />
        
        <StoryHeader
          story={currentStory}
          isOwnStory={isOwnStory}
          onClose={onClose}
          onShowProfile={() => {
            setShowProfileModal(true);
            addPauseReason('profile');
          }}
          onPause={addPauseReason}
          onResume={removePauseReason}
          onDelete={handleDeleteStory}
          onHide={handleHideStory}
          onReport={() => setIsReportDialogOpen(true)}
        />

        <StoryStickers stickerData={currentStory?.stickerData} />
        
        <StoryLinkOverlay
          showLinkOverlay={showLinkOverlay}
          stickerData={currentStory?.stickerData}
          onClose={(reason) => {
            setShowLinkOverlay(false);
            removePauseReason(reason);
          }}
        />

        <StoryBottomBar
          isOwnStory={isOwnStory}
          storyDbId={currentStoryDbId}
          isLiked={isLiked}
          isLikeLoading={isLikeLoading}
          onLikeToggle={handleLikeToggle}
          isResharing={isResharing}
          isMentionedInStory={isMentionedInStory}
          onReshare={handleReshareStory}
          onSendMessage={(msg) => {
            if (!msg.trim() || !currentStoryDbId || !user?.id || !currentStory?.user?.id) return;
            storyService.sendMessage(currentStoryDbId, user.id, currentStory.user.id, msg).then(() => {
              removePauseReason('input');
            });
          }}
          onShowActivity={() => {
            setShowActivityModal(true);
            addPauseReason('activity');
          }}
          onPause={addPauseReason}
          onResume={removePauseReason}
          storyMentions={storyMentions}
          onMentionClick={(userId) => {
            setMentionProfileUserId(userId);
          }}
        />
      </StoryInteractiveOverlay>

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

      <ReportDialog 
        isOpen={isReportDialogOpen} 
        onClose={() => setIsReportDialogOpen(false)} 
        onSubmit={handleReportStory} 
        itemType="story" 
      />
    </div>
  );
};

export default StoryViewer;