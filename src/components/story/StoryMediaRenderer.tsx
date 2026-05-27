import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Story } from '@/types/storyTypes';

interface StoryMediaRendererProps {
  story: Story;
  videoRef: React.RefObject<HTMLVideoElement>;
  bgVideoRef: React.RefObject<HTMLVideoElement>;
  setVideoDuration: (duration: number) => void;
  isTransitioning?: boolean;
  transitionDirection?: 'next' | 'prev';
  isImagePreloaded?: boolean;
}

export const StoryMediaRenderer: React.FC<StoryMediaRendererProps> = ({
  story,
  videoRef,
  bgVideoRef,
  setVideoDuration,
  isTransitioning,
  transitionDirection,
  isImagePreloaded,
}) => {
  const isVideo = story.mediaType === 'video';
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="absolute inset-0 z-0 bg-black flex flex-col items-center justify-center">
        <div className="size-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Media Unavailable</h3>
        <p className="text-white/60 text-sm max-w-[250px] text-center">
          This content could not be loaded or may have been removed.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Background Blur Layer */}
      <div className="story-bg-blur">
        {isVideo ? (
          <video
            ref={bgVideoRef}
            src={story.image}
            className="story-bg-media"
            style={{
              filter: 'blur(40px) brightness(0.7)',
              transform: 'scale(1.15)',
              objectFit: 'cover'
            }}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img
            src={story.image}
            alt=""
            className="story-bg-media"
            style={{
              filter: 'blur(40px) brightness(0.7)',
              transform: 'scale(1.15)',
              objectFit: 'cover'
            }}
            draggable={false}
          />
        )}
        <div className="story-bg-overlay" />
      </div>

      {/* Main Media Content */}
      <div className={`absolute inset-0 story-media-transition ${
        isTransitioning && isImagePreloaded
          ? (transitionDirection === 'next' ? 'story-exit-left' : 'story-exit-right')
          : ''
      }`}>
        {isVideo ? (
          <>
            {story.videoTransform ? (
              <div className="w-full h-full relative overflow-hidden bg-transparent">
                <video
                  ref={videoRef}
                  src={story.image}
                  className="absolute"
                  style={{
                    left: `${(story.videoTransform.x / story.videoTransform.canvasW) * 100}%`,
                    top: `${(story.videoTransform.y / story.videoTransform.canvasH) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${story.videoTransform.scale}) rotate(${story.videoTransform.rotation}deg)`,
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
                    if (story.videoTransform) {
                      const safeW = story.videoTransform.canvasW - 24;
                      const safeH = story.videoTransform.canvasH - 24;
                      const fitScale = Math.min(safeW / vid.videoWidth, safeH / vid.videoHeight, 1);
                      vid.style.width = `${(vid.videoWidth * fitScale / story.videoTransform.canvasW) * 100}%`;
                      vid.style.height = 'auto';
                    }
                  }}
                  onError={(e) => {
                    console.error('Video playback error:', e);
                    setHasError(true);
                  }}
                />
              </div>
            ) : (
              <video
                ref={videoRef}
                src={story.image}
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
                onError={(e) => {
                  console.error('Video playback error:', e);
                  setHasError(true);
                }}
              />
            )}
            {story.overlayUrl && (
              <img
                src={story.overlayUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[2]"
                draggable={false}
              />
            )}
          </>
        ) : (
          <img
            src={story.image}
            alt={`${story.user.name}'s story`}
            className="w-full h-full object-contain"
            draggable={false}
            onError={() => setHasError(true)}
          />
        )}
      </div>
    </>
  );
};
