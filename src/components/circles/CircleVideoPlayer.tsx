import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, ChevronLeft, ChevronRight, Lock, Crown, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { CircleVideo } from '@/hooks/useCircleVideos';
import { cn } from '@/lib/utils';

interface CircleVideoPlayerProps {
  video: CircleVideo;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onUnlock?: (video: CircleVideo) => void;
}

const CircleVideoPlayer: React.FC<CircleVideoPlayerProps> = ({ 
  video, 
  onClose, 
  onNext, 
  onPrevious,
  onUnlock 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const isLocked = video.is_premium && !video.user_has_unlocked;

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isPlaying && showControls) {
      timeout = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [isPlaying, showControls]);

  const togglePlay = () => {
    if (isLocked) return;
    if (videoRef.current?.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSliderChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--black)] flex flex-col">
      {/* Top Header */}
      <div className={cn(
        "absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-[var(--black)]/80 to-transparent transition-opacity duration-300 z-10",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-[var(--white)] hover:bg-[var(--white)]/10">
          <ChevronLeft className="size-6" />
        </Button>
        <div className="flex-1 px-4 truncate">
          <h2 className="text-[var(--white)] font-medium truncate">{video.title}</h2>
          <p className="text-[var(--white)]/60 text-xs truncate">by {video.author.name}</p>
        </div>
        <Button variant="ghost" size="icon" className="text-[var(--white)] hover:bg-[var(--white)]/10">
          <Maximize className="size-5" />
        </Button>
      </div>

      {/* Main Video Area */}
      <div 
        className="flex-1 flex items-center justify-center relative group"
        onClick={() => setShowControls(true)}
      >
        {isLocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--gray-900)] px-6 text-center space-y-6">
            <div className="size-20 rounded-full bg-primary/20 flex items-center justify-center mb-2">
              <Crown className="size-10 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[var(--white)] mb-2">Premium Content</h3>
              <p className="text-[var(--gray-400)] text-sm max-w-xs">
                This video is exclusive to circle members who have unlocked it.
              </p>
            </div>
            <Button 
              size="lg" 
              className="w-full max-w-xs bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold h-12 gap-2"
              onClick={() => onUnlock?.(video)}
            >
              <Coins className="size-5" />
              Unlock for {video.price} Coins
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={video.video_url}
              className="max-w-full max-h-full w-auto h-auto object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onCanPlay={() => setIsLoading(false)}
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              playsInline
            />
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <video src="/loading-animation.mp4" autoPlay muted playsInline loop className="w-16 h-16 object-contain" />
              </div>
            )}

            {/* Middle Play/Pause Icon (Large) */}
            <div className={cn(
              "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300",
              !isPlaying && !isLoading ? "opacity-100" : "opacity-0"
            )}>
              <div className="p-6 rounded-full bg-white/10 backdrop-blur-md">
                <Play className="size-12 text-white fill-current" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[var(--black)]/80 to-transparent transition-opacity duration-300 z-10",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        {/* Timeline Slider */}
        <div className="mb-4 px-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSliderChange}
            className="cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={togglePlay} 
              className="text-[var(--white)] hover:bg-[var(--white)]/10"
              disabled={isLocked}
            >
              {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
            </Button>
            
            <div className="flex items-center gap-2 group/volume">
              <Button variant="ghost" size="icon" onClick={toggleMute} className="text-[var(--white)] hover:bg-[var(--white)]/10">
                {isMuted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </Button>
              <div className="w-0 group-hover/volume:w-20 transition-all overflow-hidden">
                <Slider 
                  value={[isMuted ? 0 : volume]} 
                  max={1} 
                  step={0.01} 
                  onValueChange={(v) => {
                    setVolume(v[0]);
                    if (videoRef.current) videoRef.current.volume = v[0];
                    setIsMuted(v[0] === 0);
                  }}
                  className="w-16"
                />
              </div>
            </div>

            <div className="text-[var(--white)]/80 text-xs font-medium font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {onPrevious && (
              <Button variant="ghost" size="icon" onClick={onPrevious} className="text-[var(--white)] hover:bg-[var(--white)]/10">
                <ChevronLeft className="size-6" />
              </Button>
            )}
            {onNext && (
              <Button variant="ghost" size="icon" onClick={onNext} className="text-[var(--white)] hover:bg-[var(--white)]/10">
                <ChevronRight className="size-6" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CircleVideoPlayer;
