import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, MessageCircle, Crown, Bookmark, Lock, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TipButton } from './TipButton';
import { CreateCirclePostModal } from './CreateCirclePostModal';
import { SubscribeCircleModal } from './SubscribeCircleModal';
import { useCirclePosts } from '@/hooks/useCirclePosts';
import { useCircleSubscription } from '@/hooks/useCircleSubscription';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CirclePostsProps {
  circle: any;
  isOwner: boolean;
}

const CirclePosts: React.FC<CirclePostsProps> = ({ circle, isOwner }) => {
  const navigate = useNavigate();
  const { id: circleId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  
  const { data: posts = [], isLoading } = useCirclePosts(circleId);
  const { data: subscription } = useCircleSubscription(circleId);

  const hasSubscription = !!subscription;

  const handleReadMore = (post: any) => {
    // Subscribers and owners always have access
    if (hasSubscription || isOwner || post.user_has_unlocked) {
      navigate(`/circle/${circleId}/post/${post.id}`);
      return;
    }
    // Premium post without access - show subscribe modal
    if (post.is_premium) {
      setSubscribeModalOpen(true);
      return;
    }
    navigate(`/circle/${circleId}/post/${post.id}`);
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to like posts", variant: "destructive" });
        return;
      }

      if (isLiked) {
        await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
      }

      queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
    } catch (error: any) {
      console.error('Error liking post:', error);
      toast({ title: "Failed to like post", description: error.message, variant: "destructive" });
    }
  };

  const handleTip = async (postId: string, amount: number, recipientId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to tip", variant: "destructive" });
        return;
      }

      await supabase.from('circle_tips').insert({
        post_id: postId,
        tipper_id: user.id,
        recipient_id: recipientId,
        amount,
      });

      queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
      toast({ title: "Tip sent successfully!", description: `You tipped $${amount}` });
    } catch (error: any) {
      console.error('Error sending tip:', error);
      toast({ title: "Failed to send tip", description: error.message, variant: "destructive" });
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to delete posts", variant: "destructive" });
        return;
      }

      // Owners/admins can delete any post in the circle; regular users can only delete their own
      const query = supabase.from('posts').delete().eq('id', postId);
      if (!isOwner) {
        query.eq('user_id', user.id);
      }
      const { error } = await query;
      
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
      toast({ title: "Post deleted successfully" });
    } catch (error: any) {
      console.error('Error deleting post:', error);
      toast({ title: "Failed to delete post", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-0 scroll-smooth">
      {/* Create Post - Only for Owners */}
      {isOwner && (
        <div className="px-4 py-6 bg-muted/30 border-b border-border animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-sm font-semibold flex-shrink-0">
              ME
            </div>
            <div 
              onClick={() => setIsCreateModalOpen(true)}
              className="flex-1 bg-background/80 rounded-full px-4 py-3 cursor-pointer border border-border hover:bg-background transition-smooth hover-scale"
            >
              <p className="text-sm text-muted-foreground">Share something with the circle...</p>
            </div>
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="px-6 py-4 bg-background/50 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Recent Posts</h2>
          <div className="h-1 w-12 bg-gradient-primary rounded-full"></div>
        </div>
      </div>

      {/* Posts Grid Container */}
      <div className="bg-muted/20 min-h-screen">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading posts...</div>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground mb-2">No posts yet</p>
            {isOwner && (
              <p className="text-sm text-muted-foreground">Be the first to share something!</p>
            )}
          </div>
        ) : (
          <div className="px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
              {posts.map((post, index) => {
                const canView = !post.is_premium || hasSubscription || isOwner || post.user_has_unlocked;
                return (
                <div 
                  key={post.id} 
                  className="relative w-full max-w-[420px] h-[550px] overflow-hidden bg-neutral-900 text-white mx-auto animate-fade-in hover-scale shadow-elegant rounded-lg"
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  {/* Full-bleed background image */}
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt="Post cover"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
                  )}

                  {/* Premium lock overlay for locked posts */}
                  {!canView && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-10 flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <Lock className="w-16 h-16 mx-auto text-white" />
                        <div>
                          <h4 className="text-xl font-bold text-white mb-2">Premium Content</h4>
                          <p className="text-white/80 text-sm">Subscribe to view this post</p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Top-right bookmark chip */}
                <div className="absolute top-4 right-4 z-30 flex gap-2">
                  <div className="rounded-full bg-card/20 backdrop-blur-sm p-2 hover:bg-card/30 transition-smooth cursor-pointer hover-scale">
                    <Bookmark className="h-4 w-4 text-white" />
                  </div>
                  {isOwner && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-full bg-card/20 backdrop-blur-sm p-2 hover:bg-card/30 transition-smooth cursor-pointer hover-scale">
                          <MoreVertical className="h-4 w-4 text-white" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDeletePost(post.id)} className="text-red-600">
                          <Trash2 className="size-4 mr-2" />
                          Delete Post
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Bottom solid grey blurred overlay that feathers above */}
                <div className="absolute inset-x-0 bottom-0 h-[180px] bg-gray-900/80 backdrop-blur-md" />
                <div className="absolute inset-x-0 bottom-[180px] h-[60px] bg-gradient-to-t from-gray-900/80 to-transparent" />

                  {/* Content */}
                  <div className="absolute inset-x-0 bottom-0 z-20 p-6">
                    {/* Title + optional Premium pill */}
                    <div className="mb-3 flex items-start gap-3">
                      <h3 className="text-xl font-bold text-white leading-tight flex-1">
                        {post.author.name}'s Post
                      </h3>
                      {post.is_premium && (
                        <span className="rounded-full bg-gradient-secondary px-3 py-1 text-xs font-semibold text-primary-foreground animate-scale-in shadow-glow">
                          <Crown className="w-3 h-3 inline mr-1" />
                          Premium
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-white/90 text-sm leading-relaxed mb-4 line-clamp-2 whitespace-pre-wrap break-words">
                      {canView ? post.content.split(' ').map((word: string, i: number) =>
                        word.startsWith('#') ? <span key={i} className="text-primary-foreground/80 font-medium">{word} </span> : word + ' '
                      ) : 'Subscribe to read this exclusive content...'}
                    </p>

                    {/* Row with social buttons including tip button */}
                    {canView && (
                      <div className="flex gap-2 mb-4">
                        <button 
                          onClick={() => handleLike(post.id, post.user_has_liked)}
                          className={`flex-1 flex items-center justify-center gap-2 rounded-full backdrop-blur-sm px-4 py-2 text-sm font-medium text-white transition-smooth hover-scale ${
                            post.user_has_liked ? 'bg-red-500/30' : 'bg-card/15 hover:bg-card/25'
                          }`}
                        >
                          <Heart className={`h-4 w-4 ${post.user_has_liked ? 'fill-current' : ''}`} />
                          <span>{post.stats.likes_count}</span>
                        </button>
                        <button 
                          onClick={() => navigate(`/circle/${circleId}/post/${post.id}`, { state: { openComments: true } })}
                          className="flex-1 flex items-center justify-center gap-2 rounded-full bg-card/15 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white hover:bg-card/25 transition-smooth hover-scale"
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span>{post.stats.comments_count}</span>
                        </button>
                        {post.has_tips_enabled && (
                          <div className="flex-1 rounded-full bg-card/15 backdrop-blur-sm hover:bg-card/25 transition-smooth">
                            <TipButton
                              postId={post.id}
                              authorName={post.author.name}
                              tipCount={post.tip_count}
                              userHasTipped={post.user_has_tipped}
                              variant="card"
                              onTip={(amount) => handleTip(post.id, amount, post.user_id)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Full-width Read more button */}
                    <button 
                      onClick={() => handleReadMore(post)}
                      className="w-full rounded-full py-3 px-6 text-base font-semibold bg-card text-foreground shadow-glow hover:shadow-xl hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    >
                      {!canView ? (
                        <>
                          <Lock className="w-4 h-4 inline mr-2" />
                          Subscribe to Read
                        </>
                      ) : (
                        'Read more'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Bottom Spacer for better scroll experience */}
        <div className="h-24 flex items-center justify-center">
          <div className="w-16 h-1 bg-muted rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Modals */}
      <CreateCirclePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        circleId={circleId || ''}
        onPostCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
        }}
      />

      <SubscribeCircleModal
        isOpen={subscribeModalOpen}
        onClose={() => setSubscribeModalOpen(false)}
        circleId={circleId || ''}
        circleName={circle?.name || 'this circle'}
        subscriptionPrice={circle?.subscription_price}
        onSubscribed={() => {
          queryClient.invalidateQueries({ queryKey: ['circle-subscription', circleId] });
        }}
      />
    </div>
  );
};

export default CirclePosts;