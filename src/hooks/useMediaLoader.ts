import { useState, useEffect, useCallback, useRef } from 'react';

// Internal session tracking (lives outside hook but inside module)
let sessionStats = {
  total: 0,
  ok: 0,
  retrying: 0,
  broken: 0
};

const updateSession = (diff: Partial<typeof sessionStats>) => {
  sessionStats = { ...sessionStats, ...diff };
};

// Expose a global report function for the user to call in console
if (typeof window !== 'undefined') {
  (window as any).__MEDIA_GUARD_REPORT__ = () => {
    console.group("%c📊 Media Guard Session Report", "color: #3b82f6; font-size: 14px; font-weight: bold; padding: 4px;");
    console.log(`%cTotal Media Tracked: %c${sessionStats.total}`, "color: #94a3b8", "font-weight: bold");
    console.log(`%c✅ Successfully Loaded: %c${sessionStats.ok}`, "color: #10b981", "font-weight: bold");
    console.log(`%c🔄 Currently Retrying: %c${sessionStats.retrying}`, "color: #fbbf24", "font-weight: bold");
    console.log(`%c❌ Broken / Failed: %c${sessionStats.broken}`, "color: #ef4444; text-decoration: underline", "font-weight: bold");
    console.log(`%cSuccess Rate: %c${sessionStats.total > 0 ? ((sessionStats.ok / sessionStats.total) * 100).toFixed(1) : 0}%`, "color: #94a3b8", "font-weight: bold");
    console.groupEnd();
  };
}

export type MediaStatus = 'loading' | 'retrying' | 'ok' | 'broken';
export type MediaType = 'image' | 'video' | 'pdf';

interface UseMediaLoaderOptions {
  maxRetries?: number;
  baseDelay?: number;
  timeout?: number;
}

export const useMediaLoader = (
  src: string | null | undefined,
  type: MediaType,
  options: UseMediaLoaderOptions = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 2000,
    timeout = 5000
  } = options;

  const [status, setStatus] = useState<MediaStatus>('loading');
  const [attempt, setAttempt] = useState(1);
  const [retryIn, setRetryIn] = useState(0);
  
  const timerRef = useRef<NodeJS.Timeout>();
  const countdownRef = useRef<NodeJS.Timeout>();

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const validateMedia = useCallback(async (currentUrl: string, currentAttempt: number) => {
    if (!currentUrl) {
      setStatus('broken');
      return;
    }

    const triggerRetry = () => {
      if (currentAttempt < maxRetries) {
        const nextDelay = baseDelay * Math.pow(2, currentAttempt - 1);
        console.warn(`%c[MediaGuard] Retrying ${type} %c(Attempt ${currentAttempt}/${maxRetries} in ${nextDelay/1000}s): %c${currentUrl}`, 
          "color: #fbbf24; font-weight: bold", "color: #94a3b8", "color: #64748b; font-style: italic");
        
        if (currentAttempt === 1) updateSession({ retrying: sessionStats.retrying + 1 });
        
        setStatus('retrying');
        setRetryIn(Math.ceil(nextDelay / 1000));
        
        // Start countdown for UI
        let remaining = Math.ceil(nextDelay / 1000);
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setRetryIn(remaining);
          if (remaining <= 0 && countdownRef.current) {
            clearInterval(countdownRef.current);
          }
        }, 1000);

        timerRef.current = setTimeout(() => {
          setAttempt(prev => prev + 1);
        }, nextDelay);
      } else {
        console.error(`%c[MediaGuard] BROKEN ${type} %c(Failed after ${maxRetries} attempts): %c${currentUrl}`, 
          "color: #ef4444; font-weight: bold", "color: #94a3b8", "color: #64748b; text-decoration: underline");
        updateSession({ 
          retrying: Math.max(0, sessionStats.retrying - 1),
          broken: sessionStats.broken + 1 
        });
        setStatus('broken');
      }
    };

    try {
      if (type === 'image') {
        await new Promise((resolve, reject) => {
          const img = new Image();
          const timeoutId = setTimeout(() => {
            img.src = '';
            reject(new Error('Timeout'));
          }, timeout);

          img.onload = () => {
            clearTimeout(timeoutId);
            resolve(true);
          };
          img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Load failed'));
          };
          img.src = currentUrl;
        });
        console.info(`%c[MediaGuard] OK ${type} %c(Loaded on attempt ${currentAttempt}): %c${currentUrl}`, 
          "color: #10b981; font-weight: bold", "color: #94a3b8", "color: #64748b; opacity: 0.6");
        updateSession({ 
          ok: sessionStats.ok + 1,
          retrying: currentAttempt > 1 ? Math.max(0, sessionStats.retrying - 1) : sessionStats.retrying
        });
        setStatus('ok');
      } else if (type === 'pdf') {
        const response = await fetch(currentUrl, { method: 'HEAD' });
        if (!response.ok) throw new Error('PDF not found');
        console.info(`%c[MediaGuard] OK ${type} %c(Verified on attempt ${currentAttempt}): %c${currentUrl}`, 
          "color: #10b981; font-weight: bold", "color: #94a3b8", "color: #64748b; opacity: 0.6");
        updateSession({ 
          ok: sessionStats.ok + 1,
          retrying: currentAttempt > 1 ? Math.max(0, sessionStats.retrying - 1) : sessionStats.retrying
        });
        setStatus('ok');
      } else if (type === 'video') {
        await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          const timeoutId = setTimeout(() => {
            video.src = '';
            reject(new Error('Timeout'));
          }, timeout * 2);

          video.onloadeddata = () => {
            clearTimeout(timeoutId);
            resolve(true);
          };
          video.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Video load failed'));
          };
          video.src = currentUrl;
          video.load();
        });
        console.info(`%c[MediaGuard] OK ${type} %c(Playback ready on attempt ${currentAttempt}): %c${currentUrl}`, 
          "color: #10b981; font-weight: bold", "color: #94a3b8", "color: #64748b; opacity: 0.6");
        updateSession({ 
          ok: sessionStats.ok + 1,
          retrying: currentAttempt > 1 ? Math.max(0, sessionStats.retrying - 1) : sessionStats.retrying
        });
        setStatus('ok');
      }
    } catch (err) {
      triggerRetry();
    }
  }, [type, maxRetries, baseDelay, timeout]);

  useEffect(() => {
    if (!src) return;
    
    if (attempt === 1) {
      console.log(`%c[MediaGuard] Loading started for ${type}: %c${src}`, 
        "color: #3b82f6; font-weight: bold", "color: #64748b; font-style: italic");
      updateSession({ total: sessionStats.total + 1 });
    }
    
    setStatus(attempt === 1 ? 'loading' : 'retrying');
    validateMedia(src, attempt);

    return () => clearTimers();
  }, [src, attempt, validateMedia]);

  const handleRetry = useCallback(() => {
    clearTimers();
    setAttempt(1);
    setRetryIn(0);
    setStatus('loading');
  }, []);

  return {
    status,
    attempt,
    retryIn,
    retry: handleRetry
  };
};
