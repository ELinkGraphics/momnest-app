import { useState, useEffect, useCallback, useRef } from 'react';

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
        setStatus('ok');
      } else if (type === 'pdf') {
        const response = await fetch(currentUrl, { method: 'HEAD' });
        if (!response.ok) throw new Error('PDF not found');
        setStatus('ok');
      } else if (type === 'video') {
        await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          const timeoutId = setTimeout(() => {
            video.src = '';
            reject(new Error('Timeout'));
          }, timeout * 2); // Videos get a bit more time

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
        setStatus('ok');
      }
    } catch (err) {
      console.warn(`Media validation failed (Attempt ${currentAttempt}/${maxRetries}):`, err);
      triggerRetry();
    }
  }, [type, maxRetries, baseDelay, timeout]);

  useEffect(() => {
    if (!src) return;
    
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
