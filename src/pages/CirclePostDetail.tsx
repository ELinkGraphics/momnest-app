import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, Crown, Lock, Coins, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TipButton } from '@/components/circles/TipButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useCoinWallet } from '@/hooks/useCoinWallet';
import { useUser } from '@/contexts/UserContext';
import { useCircleSubscription } from '@/hooks/useCircleSubscription';
import { Input } from '@/components/ui/input';
import EmojiPicker from '@/components/EmojiPicker';
import { PremiumUnlockBanner } from '@/components/premium/PremiumUnlockBanner';
import { PremiumContentSkeleton } from '@/components/premium/PremiumContentSkeleton';

console.log('DEBUG V3: useCircleSubscription hook:', typeof useCircleSubscription);

// Comments component for circle posts
const CirclePostComments: React.FC<{ postId: string; commentsCount: number }> = ({ postId, commentsCount }) => {
  const [newComment, setNewComment] = useState('');
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['circle-post-comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_post_comments', { _post_id: postId });
      if (error) throw error;
      return data || [];
    },
    enabled: !!postId,
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['circle-post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['circle-post', postId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add comment', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!user) {
      toast({ title: 'Please log in to comment', variant: 'destructive' });
      return;
    }
    addComment.mutate(newComment.trim());
  };

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <h2 className="text-2xl font-bold text-foreground mb-6">
        Comments ({commentsCount})
      </h2>

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-6">
        {user && (
          <Avatar className="size-8 flex-shrink-0">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xs" style={{ backgroundColor: user.avatarColor }}>
              {user.initials}
            </AvatarFallback>
          </Avatar>
        )}
        <Input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? "Write a comment..." : "Log in to comment"}
          disabled={!user || addComment.isPending}
          className="flex-1"
        />
        <EmojiPicker 
          onEmojiSelect={(emoji) => setNewComment(prev => prev + emoji)}
          variant="compact"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!newComment.trim() || !user || addComment.isPending}
          className="flex-shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </form>

      {/* Comments list */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No comments yet. Be the first to comment!
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment: any) => (
            <div key={comment.comment_id} className="flex gap-3">
              <Avatar className="size-8 flex-shrink-0">
                <AvatarImage src={comment.avatar_url} />
                <AvatarFallback className="text-xs" style={{ backgroundColor: comment.avatar_color }}>
                  {comment.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-foreground">{comment.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


const CirclePostDetail: React.FC = () => {
  const { circleId, postId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { user } = useUser();
  const { wallet } = useCoinWallet(user?.id);

  // Fetch circle details
  const { data: circle } = useQuery({
    queryKey: ['circle', circleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circles')
        .select('*')
        .eq('id', circleId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!circleId,
  });

  // Fetch post details
  const { data: post, isLoading } = useQuery({
    queryKey: ['circle-post', postId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (
            id,
            name,
            username,
            avatar_url,
            initials,
            avatar_color
          ),
          post_stats (
            likes_count,
            comments_count,
            shares_count
          )
        `)
        .eq('id', postId)
        .single();

      if (error) throw error;

      // Check if user has liked the post
      const { data: likeData } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user?.id)
        .maybeSingle();

      // Get tip count for this post
      const { count: tipCount } = await supabase
        .from('circle_tips')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      // Check if user has unlocked this premium post
      let hasUnlocked = false;
      if (data.is_premium && data.premium_price && user) {
        const { data: unlockData } = await supabase
          .from('post_unlocks')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();
        hasUnlocked = !!unlockData;
      }

      return {
        ...data,
        author: data.profiles,
        stats: data.post_stats,
        user_has_liked: !!likeData,
        tip_count: tipCount || 0,
        has_unlocked: hasUnlocked,
      };
    },
    enabled: !!postId,
  });

  console.log('DEBUG V3: Calling useCircleSubscription', typeof useCircleSubscription);
  const { data: subscription, isLoading: isSubscriptionLoading } = useCircleSubscription(circleId);
  const isOwner = user?.id === circle?.creator_id || user?.id === post?.user_id;
  const isPaidPremium = post?.is_premium && post?.premium_price && post.premium_price > 0;
  const isSubscriber = subscription?.status === 'active';
  
  // While subscription is still resolving for a premium post, treat it as paywalled to prevent flash
  const subscriptionResolved = !isSubscriptionLoading;
  const shouldShowPaywall = isPaidPremium && !post?.has_unlocked && !isOwner && (!subscriptionResolved || !isSubscriber);

  if (isLoading || (isPaidPremium && isSubscriptionLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Post not found</h1>
          <p className="text-muted-foreground mb-4">The post you're looking for doesn't exist.</p>
          <Button onClick={() => navigate(`/circle/${circleId}`)}>
            Back to Circle
          </Button>
        </div>
      </div>
    );
  }

  const handleUnlock = async () => {
    if (!user) {
      toast({ title: "Please log in to unlock", variant: "destructive" });
      return;
    }
    setIsUnlocking(true);
    try {
      const { data, error } = await supabase.rpc('unlock_premium_post', {
        _user_id: user.id,
        _post_id: postId!,
      });
      if (error) throw error;
      toast({ title: "Post unlocked! 🎉", description: `You paid ${post.premium_price} coins.` });
      queryClient.invalidateQueries({ queryKey: ['circle-post', postId] });
      queryClient.invalidateQueries({ queryKey: ['coin-wallet'] });
    } catch (error: any) {
      toast({ title: "Unlock failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLike = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to like posts", variant: "destructive" });
        return;
      }

      if (post.user_has_liked) {
        await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
      }

      queryClient.invalidateQueries({ queryKey: ['circle-post', postId] });
    } catch (error: any) {
      toast({ title: "Failed to like post", description: error.message, variant: "destructive" });
    }
  };

  const handleTip = async (amount: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to tip", variant: "destructive" });
        return;
      }

      await supabase.from('circle_tips').insert({
        post_id: postId,
        tipper_id: user.id,
        recipient_id: post.user_id,
        amount,
      });

      queryClient.invalidateQueries({ queryKey: ['circle-post', postId] });
      toast({ title: "Tip sent successfully!", description: `You tipped $${amount}` });
    } catch (error: any) {
      toast({ title: "Failed to send tip", description: error.message, variant: "destructive" });
    }
  };

  const isRichText = (content: string) => {
    return /<[a-z][\s\S]*>/i.test(content) || content.includes('<p>') || content.includes('<strong>');
  };

  const getDisplayContent = () => {
    if (shouldShowPaywall) return ''; // Never expose content when paywalled
    return post?.content || '';
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(`/circle/${circleId}`)}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <h1 className="font-semibold text-lg">Post</h1>
            {post?.is_premium && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                <Crown className="size-3" />
                {post.premium_price} 🪙
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <article className="max-w-3xl mx-auto">
          {/* Hero Image */}
          {post?.cover_image_url && (
            <div className="mb-6 relative">
              <img
                src={post.cover_image_url}
                alt="Post cover"
                className={cn(
                  "w-full h-64 md:h-80 object-cover rounded-2xl",
                  shouldShowPaywall && "blur-md"
                )}
              />
              {shouldShowPaywall && (
                <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px] flex items-center justify-center rounded-2xl" />
              )}
              {post?.is_premium && !shouldShowPaywall && (
                <div className="absolute top-4 right-4 bg-gradient-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold shadow-glow">
                  Premium
                </div>
              )}
            </div>
          )}

          {/* Post Header */}
          <div className="mb-6">
            {/* Author info */}
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="size-12">
                <AvatarImage src={post.author.avatar_url} />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground" style={{ backgroundColor: post.author.avatar_color }}>
                  {post.author.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{post.author.name}</span>
                  {isOwner && (
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(post.created_at).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button 
                onClick={() => setIsBookmarked(!isBookmarked)}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isBookmarked ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <Bookmark className="size-5" />
              </button>
            </div>

            {/* Interaction buttons */}
            <div className="flex items-center gap-6 py-4 border-y border-border">
              <button 
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  post.user_has_liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Heart className={cn("size-5", post.user_has_liked && "fill-current")} />
                <span className="text-sm">{post.stats?.likes_count || 0}</span>
              </button>
              
              <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <MessageCircle className="size-5" />
                <span className="text-sm">{post.stats?.comments_count || 0}</span>
              </button>
              
              <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <Share2 className="size-5" />
                <span className="text-sm">{post.stats?.shares_count || 0}</span>
              </button>

              {post.has_tips_enabled && (
                <TipButton
                  postId={postId!}
                  authorName={post.author.name}
                  tipCount={post.tip_count || 0}
                  userHasTipped={false}
                  onTip={handleTip}
                />
              )}
            </div>
          </div>

          {/* Post Content */}
          <div className="mb-8 relative">
            {/* Visible content */}
            <div className={cn(
              "text-foreground leading-relaxed text-base",
              !isRichText(getDisplayContent()) && "whitespace-pre-line"
            )}>
              {isRichText(getDisplayContent()) ? (
                <div 
                  className="prose prose-base dark:prose-invert max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: getDisplayContent() }} 
                />
              ) : (
                getDisplayContent()
              )}
            </div>
            
            {shouldShowPaywall && (
              <div className="relative mt-8">
                {/* 
                  Container for the blurred scrolling content.
                  We render the FULL content here with heavy blur and low opacity.
                */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-muted/5">
                  {/* The actual blurred content that scrolls */}
                  <div className="pt-8 px-8 pb-[100vh] blur-[32px] opacity-20 select-none pointer-events-none grayscale">
                    {isRichText(post.content) ? (
                      <div 
                        className="prose prose-base dark:prose-invert max-w-none text-foreground"
                        dangerouslySetInnerHTML={{ __html: post.content }} 
                      />
                    ) : (
                      <div className="whitespace-pre-line text-foreground">{post.content}</div>
                    )}
                    <PremiumContentSkeleton />
                  </div>

                  {/* 
                    Fixed-Center Sticky Paywall Notice.
                    Using sticky top-1/2 and -translate-y-1/2 ensures it stays centered in the viewport
                    as long as the user is within the blurred section.
                  */}
                  <div className="absolute inset-x-0 inset-y-0 z-40 pointer-events-none group/paywall">
                    <div className="sticky top-0 h-screen flex flex-col items-center justify-center px-6 pointer-events-auto transition-all duration-700 ease-out translate-y-0">
                      {/* Subdued vignette background that appears when modal is sticky */}
                      <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px] opacity-0 group-hover/paywall:opacity-100 transition-opacity duration-1000" />
                      
                      <div className="relative w-full max-w-md bg-background/80 backdrop-blur-3xl rounded-[2.5rem] border border-white/20 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] p-1 overflow-hidden group animate-in zoom-in-95 fade-in duration-700">
                        {/* Animated Mesh Background for the modal effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 animate-pulse" />
                        
                        <div className="relative p-6">
                          <PremiumUnlockBanner
                            price={post.premium_price || 0}
                            balance={wallet?.balance ?? 0}
                            onUnlock={handleUnlock}
                            isUnlocking={isUnlocking}
                            className="my-0 border-0 shadow-none bg-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* High-opacity bottom mask to block peeking at the end */}
                  <div className="absolute inset-x-0 bottom-0 h-[60vh] bg-gradient-to-t from-background via-background to-transparent pointer-events-none z-10" />
                </div>
                </div>
            )}
            
            {/* Show full content if unlocked */}
            {!shouldShowPaywall && post?.content !== getDisplayContent() && (
              <div className={cn(
                "text-foreground leading-relaxed text-base mt-8",
                !isRichText(post?.content || '') && "whitespace-pre-line"
              )}>
                {(() => {
                  const fullContent = post?.content || '';
                  if (isRichText(fullContent)) {
                    const paragraphs = fullContent.match(/<p>[\s\S]*?<\/p>/gi) || [];
                    if (paragraphs.length > 1) {
                      return <div 
                        className="prose prose-base dark:prose-invert max-w-none text-foreground"
                        dangerouslySetInnerHTML={{ __html: paragraphs.slice(1).join('') }} 
                      />;
                    }
                    return null;
                  }
                  const paragraphs = fullContent.split('\n\n');
                  if (paragraphs.length > 1) {
                    return paragraphs.slice(1).join('\n\n');
                  }
                  return '';
                })()}
              </div>
            )}
          </div>

          {/* Comments Section */}
          {!shouldShowPaywall && (
            <CirclePostComments postId={postId!} commentsCount={post.stats?.comments_count || 0} />
          )}
        </article>
      </main>
    </div>
  );
};

export default CirclePostDetail;
