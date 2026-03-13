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
    <div className="fixed bottom-6 right-6 z-[100] bg-zinc-900 text-white p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 max-w-[340px] w-[calc(100%-3rem)] animate-in slide-in-from-bottom-5 fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-bold text-lg tracking-tight">🚀 Performance Update</h4>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            We've improved the app's performance. Refresh to apply the latest optimizations.
          </p>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-white/10 rounded-full transition-colors opacity-60 hover:opacity-100"
        >
          <X className="size-5" />
        </button>
      </div>
      
      <div className="flex gap-3 mt-6">
        <Button
          onClick={handleUpdate}
          className="flex-1 bg-white text-black hover:bg-zinc-200 rounded-2xl h-11 font-semibold transition-all active:scale-95"
        >
          <RefreshCw className="mr-2 h-4 w-4 animate-spin-slow" />
          Update Now
        </Button>
      </div>
    </div>
  );
};

export default UpdateNotifier;