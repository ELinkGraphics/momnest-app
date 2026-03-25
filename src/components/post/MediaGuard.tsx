import React from 'react';
import { useMediaLoader, MediaType } from '@/hooks/useMediaLoader';
import { FileText, AlertCircle, RefreshCw, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import './MediaGuard.css';


import { usePdfThumbnail } from '@/hooks/usePdfThumbnail';

interface MediaGuardItemProps {
  src: string;
  type: MediaType;
  alt?: string;
  className?: string;
  aspectRatio?: string;
  showOverlay?: boolean;
}

export const MediaGuardItem: React.FC<MediaGuardItemProps> = ({
  src,
  type,
  alt = "Media content",
  className,
  aspectRatio = "aspect-[4/5]",
  showOverlay = true
}) => {
  const { status, attempt, retryIn, retry } = useMediaLoader(src, type);
  const { thumbnailUrl, loading: pdfLoading } = usePdfThumbnail(type === 'pdf' ? src : null);

  // Render Skeleton (Loading or Retrying or PDF Thumbnail Generation)
  if (status === 'loading' || status === 'retrying' || (type === 'pdf' && status === 'ok' && !thumbnailUrl)) {
    return (
      <div className={cn("media-guard-container rounded-xl flex flex-col items-center justify-center relative", aspectRatio, className)}>
        <div className="media-shimmer absolute inset-0 rounded-xl" />
        
        <div className="relative z-10 flex flex-col items-center gap-3">
          {type === 'pdf' ? (
            <FileText className="w-8 h-8 text-white/20" />
          ) : type === 'video' ? (
            <PlayCircle className="w-8 h-8 text-white/20" />
          ) : null}
          
          {(status === 'retrying') && (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Connection unstable
              </span>
              <span className="text-xs font-medium text-white/60">
                Attempt {attempt}/3 • Retry in {retryIn}s
              </span>
            </div>
          )}

          {type === 'pdf' && status === 'ok' && !thumbnailUrl && (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 animate-pulse">
                Generating Preview
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Broken State
  if (status === 'broken' || !src) {
    return (
      <div className={cn("media-guard-container rounded-xl flex flex-col items-center justify-center bg-black/5 dark:bg-white/5", aspectRatio, className)}>
        <div className="media-error-icon mb-3">
          <AlertCircle className="w-10 h-10 text-red-500/50" />
        </div>
        <p className="text-sm font-medium text-foreground/40 mb-4">Media unavailable</p>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            retry();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-300 pointer-events-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-xs font-semibold">Try again</span>
        </button>
      </div>
    );
  }

  // Final display source for images/PDFs
  const displaySrc = type === 'pdf' ? (thumbnailUrl || src) : src;

  // Render OK Media
  return (
    <div className={cn("media-guard-container rounded-xl media-fade-in group", aspectRatio, className)}>
      {type === 'image' || type === 'pdf' ? (
        <img
          src={displaySrc}
          alt={alt}
          className="w-full h-full object-cover rounded-xl"
          loading="lazy"
        />
      ) : (
        <video
          src={src}
          className="w-full h-full object-cover rounded-xl"
          muted
          loop
          playsInline
          autoPlay
        />
      )}

      {/* Media Indicator Overlay */}
      {showOverlay && type === 'pdf' && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-xl">
          <FileText className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest">PDF</span>
        </div>
      )}

      {showOverlay && type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors duration-300">
          <div className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white transform scale-90 group-hover:scale-100 transition-transform duration-300">
            <PlayCircle className="w-8 h-8" />
          </div>
        </div>
      )}
    </div>
  );
};

interface FeedMediaProps {
  post: {
    id: string | number;
    post_type: 'photo' | 'video' | 'pdf' | 'text' | string;
    media_url?: string | null;
    media_urls?: string[] | null;
    content?: string;
  };
  className?: string;
  aspectRatio?: string;
}

export const FeedMedia: React.FC<FeedMediaProps> = ({ 
  post, 
  className,
  aspectRatio = "aspect-[4/5]"
}) => {
  const src = post.post_type === 'pdf' 
    ? (post.media_urls?.[0] || post.media_url) 
    : (post.media_url || post.media_urls?.[0]);

  const type: MediaType = post.post_type === 'pdf' 
    ? 'pdf' 
    : post.post_type === 'video' 
      ? 'video' 
      : 'image';

  if (!src) return null;

  return (
    <MediaGuardItem 
      src={src} 
      type={type} 
      alt={post.content || "Post media"} 
      className={className}
      aspectRatio={aspectRatio}
    />
  );
};
