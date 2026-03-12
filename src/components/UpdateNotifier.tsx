import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { cacheManager, isFilePickerActive } from '@/utils/cacheManager';

const UpdateNotifier: React.FC = () => {
  const queryClient = useQueryClient();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Force show update banner once so users reinstall the PWA
    const hasSeenReinstall = localStorage.getItem('pwa-reinstall-v2-seen');
    if (!hasSeenReinstall) {
      setUpdateAvailable(true);
      setShowNotification(true);
      return;
    }

    if (import.meta.env.DEV) return;
    let checkInterval: ReturnType<typeof setInterval>;

    const checkForUpdates = async () => {
      if (isFilePickerActive()) return;
      
      try {
        const hasUpdate = await cacheManager.checkForUpdates();
        if (hasUpdate && !updateAvailable) {
          setUpdateAvailable(true);
          setShowNotification(true);
        }
      } catch (error) {
        console.error('Update check failed:', error);
      }
    };

    checkForUpdates();
    checkInterval = setInterval(checkForUpdates, 5000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          if (!isFilePickerActive()) {
            checkForUpdates();
          }
        }, 3000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateAvailable]);

  const handleUpdate = async () => {
    localStorage.setItem('pwa-reinstall-v2-seen', 'true');
    try {
      await cacheManager.clearQueryCache(queryClient);
      await cacheManager.applyUpdate();
    } catch (error) {
      console.error('Update failed:', error);
      await cacheManager.forceRefresh();
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-reinstall-v2-seen', 'true');
    setShowNotification(false);
  };

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-primary text-primary-foreground p-4 rounded-xl shadow-2xl max-w-sm w-[calc(100%-2rem)] animate-slide-down">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="font-semibold text-base">🎉 New Update Available!</h4>
          <p className="text-xs opacity-95 mt-1.5 leading-relaxed">
            We've made important improvements to MomsNest. Please update now and reinstall the app for the best experience.
          </p>
        </div>
      </div>
      
      <div className="flex gap-2 mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleUpdate}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium active:scale-95 transition-transform"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update Now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-xs text-primary-foreground/80 hover:bg-primary-foreground/10 px-3"
        >
          Later
        </Button>
      </div>
    </div>
  );
};

export default UpdateNotifier;