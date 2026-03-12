import React from 'react';
import { cn } from '@/lib/utils';

interface VideoLoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
  sublabel?: string;
  fullscreen?: boolean;
  dark?: boolean;
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-32 h-32',
  xl: 'w-40 h-40',
};

export const VideoLoader: React.FC<VideoLoaderProps> = ({ 
  size = 'md', 
  className, 
  label, 
  sublabel,
  fullscreen = false,
  dark = false,
}) => {
  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <video
        src="/loading-animation.mp4"
        autoPlay
        muted
        playsInline
        loop
        className={cn('object-contain', sizeMap[size])}
      />
      {label && (
        <p className={cn('font-medium text-lg', dark ? 'text-white' : 'text-foreground')}>
          {label}
        </p>
      )}
      {sublabel && (
        <p className={cn('text-sm', dark ? 'text-white/70' : 'text-muted-foreground')}>
          {sublabel}
        </p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className={cn(
        'fixed inset-0 z-[200] flex items-center justify-center',
        dark ? 'bg-black/80' : 'bg-background/80 backdrop-blur-sm'
      )}>
        {content}
      </div>
    );
  }

  return content;
};

/** Inline loader for buttons — shows the video at a tiny size next to text */
export const InlineVideoLoader: React.FC<{ className?: string }> = ({ className }) => (
  <video
    src="/loading-animation.mp4"
    autoPlay
    muted
    playsInline
    loop
    className={cn('w-5 h-5 object-contain', className)}
  />
);
