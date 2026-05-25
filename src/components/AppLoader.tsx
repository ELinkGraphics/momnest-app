import { useEffect, useState, useRef } from 'react';
import { cacheManager } from '@/utils/cacheManager';

interface AppLoaderProps {
  onComplete: () => void;
}

export const AppLoader = ({ onComplete }: AppLoaderProps) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const initializeApp = async () => {
      const startTime = Date.now();
      const minLoadTime = 1500;

      try {
        cacheManager.checkForUpdates().catch(console.error);
        
        // Wait for minimum load time
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadTime - elapsed);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
        
        setReady(true);
      } catch (error) {
        console.error('Initialization error:', error);
        setReady(true);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (ready) {
      setFadeOut(true);
      const timer = setTimeout(() => onComplete(), 500);
      return () => clearTimeout(timer);
    }
  }, [ready, onComplete]);

  return (
    <div
      className={`fixed inset-0 bg-background z-50 flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <img
        src="/lovable-uploads/SerkleMainLogo.svg"
        alt="Serkle Logo"
        className="w-40 h-40 object-contain animate-color-reveal"
      />
    </div>
  );
};
