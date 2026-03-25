import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal, BadgeCheck, Plus, Check, Trash2, Bookmark, Flag, Crown, Lock, MapPin, Mic, BookImage, Play, ThumbsUp, Laugh, LifeBuoy, Ghost, Angry, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { Post } from '@/data/mock';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { usePostMutations } from '@/hooks/usePostMutations';
import { useFollowMutations } from '@/hooks/useFollowMutations';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import PublicProfileModal from '@/components/PublicProfileModal';
import LikersModal from '@/components/LikersModal';
import PostReactionButton from './post/PostReactionButton';
import { PremiumContentSkeleton } from '@/components/premium/PremiumContentSkeleton';
import SharePostToStoryModal from '@/components/story/SharePostToStoryModal';
import { Carousel, CarouselContent, CarouselItem, CarouselApi } from '@/components/ui/carousel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PDFCarousel } from './post/PDFCarousel';
import { MediaGuardItem } from './post/MediaGuard';
import ReactionPicker from './post/ReactionPicker';

interface PostCardProps {
  post: Post;
}

const formatRelativeTime = (iso: string) => {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
};

const formatCount = (n: number) => {
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "m";
};

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(url);

const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const isTextLong = post.content.length > 120;
  const [liked, setLiked] = useState(post.userHasLiked || false);
  const [likesCount, setLikesCount] = useState(post.stats.likes);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sharesCount, setSharesCount] = useState(post.stats.shares);
  const [followState, setFollowState] = useState<'visible' | 'checked' | 'hidden'>('visible');
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Sync state with props when post changes (important for real-time updates after refetch)
  useEffect(() => {
    setLiked(post.userHasLiked || false);
    setLikesCount(post.stats.likes);
  }, [post.userHasLiked, post.stats.likes]);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [showShareToStory, setShowShareToStory] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [playingVideos, setPlayingVideos] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const { user } = useUser();
  const { toggleLike, toggleSave, incrementShare, deletePost } = usePostMutations();
  const { toggleFollow, checkFollowStatus } = useFollowMutations();

  useEffect(() => {
    const checkInitialFollowStatus = async () => {
      if (user && post.user.id && user.id !== post.user.id) {
        const following = await checkFollowStatus(post.user.id);
        if (following) setFollowState('hidden');
      }
    };
    checkInitialFollowStatus();
  }, [post.user.id, user, checkFollowStatus]);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on('select', onSelect);
    return () => { carouselApi.off('select', onSelect); };
  }, [carouselApi]);

  // Reset playing state when slide changes
  useEffect(() => {
    setPlayingVideos(new Set());
  }, [currentSlide]);

  const relative = formatRelativeTime(post.time);
  const isPremiumCirclePost = post.isPremium && post.circleId;
  const isUnlocked = post.userHasUnlocked || user?.id === post.user.id;
  const shouldShowPaywall = isPremiumCirclePost && !isUnlocked;

  const handleLike = async (reactionType: string = 'like') => {
    if (!user) {
      toast({ title: "Please login to like posts" });
      return;
    }
    
    // Toggle logic if no type provided or if same type clicked
    const isRemoving = liked && (reactionType === 'like' || !reactionType);
    
    // In our new button, reactionType is always provided if liking. 
    // If unliking, it might be undefined or 'like'.
    
    const wasLiked = liked;
    const willBeLiked = !isRemoving;
    
    // Optimistic UI
    if (!wasLiked && willBeLiked) {
      setLikesCount(prev => prev + 1);
    } else if (wasLiked && !willBeLiked) {
      setLikesCount(prev => prev - 1);
    }
    
    setLiked(willBeLiked);
    
    await toggleLike(String(post.id), user.id, wasLiked, reactionType);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaved(!saved);
    await toggleSave(String(post.id), user.id, saved);
  };

  const handleShare = async () => {
    setSharesCount(prev => prev + 1);
    await incrementShare(String(post.id));
    const postUrl = window.location.origin + `/post/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ url: postUrl }); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(postUrl);
        toast({ title: "Link copied" });
      } catch {}
    }
  };

  const handleOpenPost = () => {
    if (post.circleId) navigate(`/circle/${post.circleId}`);
    else navigate(`/post/${post.id}`);
  };

  const handleDelete = async () => {
    if (!user || !post.user.id) return;
    if (window.confirm('Are you sure you want to delete this post?')) {
      await deletePost(String(post.id), user.id);
      toast({ title: "Post deleted" });
      window.location.reload();
    }
  };

  const handleCircleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.circleId) navigate(`/circle/${post.circleId}`);
  };

  // Render hashtags and @mentions in caption
  const renderCaption = (text: string) => {
    const parts = text.split(/(@\w+|#\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        return <span key={i} className="text-primary font-medium">{part}</span>;
      }
      if (part.startsWith('@')) {
        const username = part.slice(1);
        return (
          <button
            key={i}
            className="font-bold text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/profile/${username}`);
            }}
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const isRichText = (content: string) => {
    return /<[a-z][\s\S]*>/i.test(content) || content.includes('<p>') || content.includes('<strong>') || content.includes('<ul>');
  };

  return (
    <article className="bg-card rounded-2xl overflow-hidden shadow-[var(--shadow-soft)] border border-border/50 mb-3">
      {/* ── HEADER ── */}
      <header className="px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="relative">
          <div
            className="size-10 rounded-full ring-2 ring-offset-1 ring-primary/30 overflow-hidden grid place-items-center text-xs font-medium text-white"
            style={{ background: post.circleId ? '#4B164C' : post.user.avatarColor }}
          >
            {(post.circleId ? post.circleAvatar : post.user.avatar) ? (
              <img src={post.circleId ? post.circleAvatar : post.user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              post.circleId ? (post.circleName?.[0] || 'C') : post.user.initials
            )}
          </div>
          {/* Follow badge */}
          {!post.circleId && followState !== 'hidden' && user?.id !== post.user.id && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!user) { toast({ title: "Please login to follow users" }); return; }
                const followed = await toggleFollow(post.user.id || '');
                if (followed) { setFollowState('checked'); setTimeout(() => setFollowState('hidden'), 1500); }
              }}
              className="absolute -bottom-1 -right-0.5 size-4 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-sm hover:scale-110 transition-transform"
              aria-label="Follow user"
            >
              {followState === 'visible' ? <Plus className="size-2.5 text-white" /> : <Check className="size-2.5 text-white" />}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
              className="font-bold text-[14px] truncate text-foreground cursor-pointer hover:underline"
              onClick={post.circleId ? handleCircleClick : (e) => { e.stopPropagation(); setShowProfileModal(true); }}
            >
              {post.circleId ? post.circleName : post.user.name}
            </h3>
            {post.user.verified && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <BadgeCheck className="size-4 text-secondary cursor-pointer" aria-label="Verified account" />
                  </TooltipTrigger>
                  <TooltipContent><p>Verified account</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isPremiumCirclePost && (
              <span className={cn(
                "text-[9px] font-medium px-1.5 py-0.5 rounded-full border flex items-center gap-0.5",
                post.userHasUnlocked ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-tertiary text-primary border-secondary/30"
              )}>
                {post.userHasUnlocked ? (
                  <Check className="size-2.5" />
                ) : (
                  <Crown className="size-2.5" />
                )}
                {post.userHasUnlocked ? 'Paid' : 'Premium'}
              </span>
            )}
            {post.sponsored && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-tertiary text-primary border border-primary/20">
                Sponsored
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground font-medium flex items-center gap-1.5">
            {post.circleId && (
              <button
                className="font-semibold text-foreground hover:underline"
                onClick={(e) => { e.stopPropagation(); setShowProfileModal(true); }}
              >
                {post.user.name}
              </button>
            )}
            {post.circleId && <span className="text-muted-foreground">·</span>}
            {relative}
            {post.locationText && (
              <span className="flex items-center gap-0.5 text-primary">
                <MapPin className="size-3" />
                <span className="max-w-[140px] truncate">{post.locationText}</span>
              </span>
            )}
            {post.circleId && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold border border-primary/20">
                Circle
              </span>
            )}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-full hover:bg-muted/50 transition-colors" aria-label="More options">
              <MoreHorizontal className="size-5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}><Share2 className="size-4 mr-2" />Share</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowShareToStory(true)}><BookImage className="size-4 mr-2" />Share to Story</DropdownMenuItem>
            <DropdownMenuItem onClick={handleSave}><Bookmark className="size-4 mr-2" />{saved ? 'Unsave' : 'Save'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast({ title: "Report submitted" })}><Flag className="size-4 mr-2" />Report</DropdownMenuItem>
            {user?.id === post.user.id && (
              <>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={handleDelete} className="text-red-600"><Trash2 className="size-4 mr-2" />Delete Post</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ── MEDIA ── */}
      {post.post_type === 'pdf' && post.media?.urls && post.media.urls.length > 0 ? (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <PDFCarousel pages={post.media.urls} className="aspect-[4/5]" />
        </div>
      ) : post.media && post.media.urls && post.media.urls.length > 0 ? (
        <div className="relative">
          <Carousel className="w-full" setApi={setCarouselApi}>
            <CarouselContent>
              {post.media.urls.map((url, index) => (
                <CarouselItem key={index}>
                  <div className="relative overflow-hidden cursor-pointer" onClick={handleOpenPost}>
                    <MediaGuardItem 
                      src={url} 
                      type={/\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(url) ? 'video' : 'image'} 
                      alt={`${post.media?.alt || 'Post image'} ${index + 1}`}
                      aspectRatio="aspect-square"
                      showOverlay={false}
                    />
                    {shouldShowPaywall && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-center justify-center" />
                    )}
                    {isVideoUrl(url) && !playingVideos.has(index) && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/30 backdrop-blur-md rounded-full p-4 border border-white/20 shadow-2xl transition-opacity duration-300">
                          <Play className="size-8 text-white fill-white opacity-90" />
                        </div>
                      </div>
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          {post.media.urls.length > 1 && (
            <>
              <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-full z-10">
                {currentSlide + 1}/{post.media.urls.length}
              </div>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {post.media.urls.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'bg-primary w-4' : 'bg-card/60 w-1.5'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : post.media && post.media.url ? (
        <div className="relative overflow-hidden cursor-pointer" onClick={handleOpenPost}>
          {isVideoUrl(post.media.url) ? (
            <video
              src={post.media.url}
              poster={post.thumbnailUrl}
              className="w-full aspect-square object-cover"
              controls
              preload="metadata"
              playsInline
              onClick={(e) => e.stopPropagation()}
              onPlay={() => setPlayingVideos(prev => new Set(prev).add(0))}
              onPause={() => setPlayingVideos(prev => {
                const next = new Set(prev);
                next.delete(0);
                return next;
              })}
              onEnded={() => setPlayingVideos(prev => {
                const next = new Set(prev);
                next.delete(0);
                return next;
              })}
            />
          ) : (
            <img
              src={post.media.url}
              alt={post.media.alt || ""}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />
          )}
          {(post.totalMediaCount ?? 0) > 1 && (
            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-semibold px-2.5 py-1 rounded-full z-10">
              +{(post.totalMediaCount ?? 0) - 1} more
            </div>
          )}
          {shouldShowPaywall && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-center justify-center" />
          )}
          {isVideoUrl(post.media.url) && !playingVideos.has(0) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/30 backdrop-blur-md rounded-full p-4 border border-white/20 shadow-2xl transition-opacity duration-300">
                <Play className="size-8 text-white fill-white opacity-90" />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── VOICE NOTE ── */}
      {post.voiceUrl && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <Mic className="size-4 text-primary shrink-0" />
          <audio controls src={post.voiceUrl} className="h-8 flex-1 max-w-full" preload="metadata" />
        </div>
      )}

      {/* ── INTERACTION ROW ── */}
      <div className="px-3 pt-3 pb-1 flex items-center">
        <div className="flex items-center gap-4">
          {/* Like */}
          <PostReactionButton
            isLiked={liked}
            likesCount={likesCount}
            userReaction={post.userReaction}
            onLike={handleLike}
            onShowLikers={() => setShowLikersModal(true)}
          />
          {/* Comment */}
          <button onClick={handleOpenPost} className="flex items-center gap-1.5 group" aria-label="Comments">
            <MessageCircle className="size-[22px] text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="text-[13px] font-semibold text-muted-foreground">{formatCount(post.stats.comments)}</span>
          </button>
          {/* Share */}
          <button onClick={handleShare} className="flex items-center gap-1.5 group" aria-label="Share">
            <Share2 className="size-[22px] text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="text-[13px] font-semibold text-muted-foreground">{formatCount(sharesCount)}</span>
          </button>
        </div>
        {/* Bookmark — pushed right */}
        <button onClick={handleSave} className="ml-auto" aria-label={saved ? 'Unsave' : 'Save'}>
          <Bookmark className={`size-[22px] transition-all duration-300 ${saved ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`} />
        </button>
      </div>

      {/* ── CAPTION ── */}
      <div className="px-4 pt-1 pb-4" dir="auto">
        {shouldShowPaywall ? (
          <div className="relative overflow-hidden rounded-xl border border-white/5 bg-muted/5 backdrop-blur-sm p-4 mt-2">
            <div className="max-h-24 overflow-hidden blur-[8px] opacity-20 pointer-events-none select-none grayscale">
              {isRichText(post.content) ? (
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
              ) : (
                <p>{post.content}</p>
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[2px]">
              <button className="bg-primary/90 hover:bg-primary text-primary-foreground text-[12px] font-bold px-4 py-2 rounded-full shadow-glow transition-all flex items-center gap-1.5" onClick={handleOpenPost}>
                <Lock className="size-3" />
                {(post as any).premium_price ? `Unlock for ${(post as any).premium_price} 🪙` : 'Unlock Premium'}
              </button>
            </div>
          </div>
        ) : (
          <div className={cn(
            "text-[14px] text-foreground leading-relaxed break-words",
            !isRichText(post.content) && "whitespace-pre-wrap"
          )}>
            <button
              className="font-bold text-foreground mr-1 hover:underline align-top"
              onClick={post.circleId ? handleCircleClick : (e) => { e.stopPropagation(); setShowProfileModal(true); }}
            >
              {post.circleId ? post.circleName : post.user.name}
            </button>
            
            {isRichText(post.content) ? (
              <div 
                className={cn(
                  "prose prose-sm dark:prose-invert max-w-none text-foreground inline-block",
                  !expanded && "line-clamp-3"
                )}
                dangerouslySetInnerHTML={{ __html: post.content }} 
              />
            ) : (
              <>
                {expanded ? renderCaption(post.content) : renderCaption(isTextLong ? post.content.slice(0, 120) : post.content)}
              </>
            )}
            
            {isTextLong && !expanded && !isRichText(post.content) && (
              <button className="text-muted-foreground text-[13px] ml-1" onClick={() => setExpanded(true)}>more</button>
            )}
            {isRichText(post.content) && !expanded && (
               <button className="text-muted-foreground text-[13px] mt-1 block" onClick={() => setExpanded(true)}>Show more</button>
            )}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/[0.08] text-primary border border-primary/[0.15]">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* View all comments link */}
        {post.stats.comments > 0 && (
          <button onClick={handleOpenPost} className="text-[12px] text-muted-foreground mt-1.5 block">
            View all {post.stats.comments} comments
          </button>
        )}
      </div>

      <PublicProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} userId={post.user.id || ''} />
      <LikersModal isOpen={showLikersModal} onClose={() => setShowLikersModal(false)} postId={String(post.id)} />
      <SharePostToStoryModal isOpen={showShareToStory} onClose={() => setShowShareToStory(false)} post={post} />
    </article>
  );
};

export default PostCard;
