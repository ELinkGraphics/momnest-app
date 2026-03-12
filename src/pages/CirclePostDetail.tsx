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
import { Input } from '@/components/ui/input';
import EmojiPicker from '@/components/EmojiPicker';

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

const PremiumUnlockBanner: React.FC<{ 
  price: number; 
  balance: number; 
  onUnlock: () => void; 
  isUnlocking: boolean;
}> = ({ price, balance, onUnlock, isUnlocking }) => {
  const canAfford = balance >= price;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-tertiary/50 to-tertiary/80 dark:from-primary/20 dark:to-primary/10 border border-tertiary dark:border-primary p-6 my-6">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-primary/20 rounded-full -translate-y-16 translate-x-16" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-gradient-primary shadow-glow">
            <Lock className="size-5 text-primary-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Premium Content</h3>
        </div>
        <p className="text-muted-foreground mb-4 leading-relaxed">
          This is a premium post. Pay <span className="font-bold text-primary">{price} 🪙</span> coins to unlock the full content.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={onUnlock}
            disabled={!canAfford || isUnlocking}
            className="flex-1 bg-gradient-primary hover:bg-gradient-primary/90 text-primary-foreground border-0 shadow-glow hover:shadow-xl transition-all duration-200 disabled:opacity-50"
          >
            <Coins className="size-4 mr-2" />
            {isUnlocking ? 'Unlocking...' : `Unlock for ${price} 🪙`}
          </Button>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span>Your balance: <span className={cn("font-semibold", canAfford ? "text-primary" : "text-destructive")}>{balance} 🪙</span></span>
          {!canAfford && <span className="text-destructive">Insufficient coins — top up your wallet</span>}
        </div>
      </div>
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

  const isOwner = circle?.creator_id === post?.user_id || user?.id === post?.user_id;
  const isPaidPremium = post?.is_premium && post?.premium_price && post.premium_price > 0;
  const shouldShowPaywall = isPaidPremium && !post?.has_unlocked && !isOwner;

  if (isLoading) {
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

  const getDisplayContent = () => {
    if (!shouldShowPaywall) {
      return post?.content;
    }
    // For premium posts that are locked, show only first 2 paragraphs
    const fullContent = post?.content || '';
    const paragraphs = fullContent.split('\n\n');
    if (paragraphs.length <= 2) {
      return fullContent;
    }
    return paragraphs.slice(0, 2).join('\n\n');
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
                <div className="absolute inset-0 bg-background/40 flex items-center justify-center rounded-2xl">
                  <div className="flex flex-col items-center gap-2 text-foreground">
                    <Lock className="size-8" />
                    <span className="text-sm font-semibold">Premium Content</span>
                  </div>
                </div>
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
          <div className="prose prose-lg max-w-none mb-8 relative">
            {/* Visible content */}
            <div className="text-foreground leading-relaxed text-base whitespace-pre-line">
              {getDisplayContent()}
            </div>
            
            {shouldShowPaywall && (
              <>
                {/* Fade overlay for remaining content */}
                <div className="relative mt-8">
                  <div 
                    className="text-foreground leading-relaxed text-base whitespace-pre-line transition-all duration-500"
                    style={{ opacity: 0.3, filter: 'blur(2px)' }}
                  >
                    {(() => {
                      const fullContent = post?.content || '';
                      const paragraphs = fullContent.split('\n\n');
                      if (paragraphs.length > 2) {
                        return paragraphs.slice(2).join('\n\n');
                      }
                      return '';
                    })()}
                  </div>
                  
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
                    <div className="absolute bottom-0 left-0 right-0 pointer-events-auto pt-12">
                      <div className="max-w-md mx-auto px-4">
                        <PremiumUnlockBanner
                          price={post.premium_price || 0}
                          balance={wallet?.balance ?? 0}
                          onUnlock={handleUnlock}
                          isUnlocking={isUnlocking}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {/* Show full content if unlocked */}
            {!shouldShowPaywall && post?.content !== getDisplayContent() && (
              <div className="text-foreground leading-relaxed text-base whitespace-pre-line mt-8">
                {(() => {
                  const fullContent = post?.content || '';
                  const paragraphs = fullContent.split('\n\n');
                  if (paragraphs.length > 2) {
                    return paragraphs.slice(2).join('\n\n');
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
