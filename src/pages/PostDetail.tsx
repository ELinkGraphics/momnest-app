import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, Share2, MoreHorizontal, BadgeCheck, Send, Loader2, MapPin, Mic, Pencil, Trash2, Bookmark, Flag, BookmarkCheck, Image } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { PersistentCommentComposer } from '@/components/PersistentCommentComposer';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useUser } from '@/contexts/UserContext';
import { usePostMutations } from '@/hooks/usePostMutations';
import { useCoinWallet } from '@/hooks/useCoinWallet';
import { GiftEmoji } from '@/components/GiftEmojiPicker';
import { Carousel, CarouselContent, CarouselItem, CarouselApi } from '@/components/ui/carousel';
import CommentActionMenu from '@/components/CommentActionMenu';
import { toast } from 'sonner';

interface Comment {
  id: string;
  userId?: string;
  username?: string;
  user: {
    name: string;
    initials: string;
    avatarColor: string;
    avatar?: string;
    verified?: boolean;
  };
  text: string;
  timestamp: string;
  likes: number;
  replies: number;
  isLiked: boolean;
  parentId?: string;
}

const formatCount = (n: number) => {
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "m";
};

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

const PostDetail: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const { user } = useUser();
  const { toggleLike, addComment } = usePostMutations();
  const { transferCoins } = useCoinWallet(user?.id);

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [detailCarouselApi, setDetailCarouselApi] = useState<CarouselApi>();
  const [detailCurrentSlide, setDetailCurrentSlide] = useState(0);
  const [commentAction, setCommentAction] = useState<{ commentId: string; position: { x: number; y: number } } | null>(null);

  // Track detail carousel slide changes
  useEffect(() => {
    if (!detailCarouselApi) return;
    const onSelect = () => setDetailCurrentSlide(detailCarouselApi.selectedScrollSnap());
    detailCarouselApi.on('select', onSelect);
    return () => { detailCarouselApi.off('select', onSelect); };
  }, [detailCarouselApi]);

  // Fetch post and comments from database
  useEffect(() => {
    const fetchPost = async () => {
      if (!postId) return;

      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles!inner(name, username, avatar_url, initials, avatar_color, is_verified),
          post_stats(likes_count, comments_count, shares_count, saves_count)
        `)
        .eq('id', postId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching post:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setPost(data);
        setLikesCount(data.post_stats?.likes_count || 0);

        // Check if user has liked this post
        if (user) {
          const { data: likeData } = await supabase
            .from('likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .maybeSingle();

          setLiked(!!likeData);
        }

        // Fetch comments for this post
        const { data: commentsData, error: commentsError } = await supabase
          .rpc('get_post_comments', { _post_id: postId });

        if (commentsError) {
          console.error('Error fetching comments:', commentsError);
        } else if (commentsData) {
          const formattedComments: Comment[] = commentsData.map((c: any) => ({
            id: c.comment_id,
            userId: c.user_id,
            username: c.username,
            user: {
              name: c.name,
              initials: c.initials,
              avatarColor: c.avatar_color,
              avatar: c.avatar_url,
              verified: false,
            },
            text: c.content,
            timestamp: formatRelativeTime(c.created_at),
            likes: c.likes_count || 0,
            replies: 0,
            isLiked: c.user_has_liked || false,
            parentId: c.parent_id || undefined,
          }));
          setComments(formattedComments);
        }
      }
      setLoading(false);
    };

    fetchPost();
  }, [postId, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Post not found</h2>
          <Button onClick={() => navigate('/')} variant="outline">
            Go back to feed
          </Button>
        </div>
      </div>
    );
  }

  const handleCommentSubmit = async (commentText: string, parentId?: string) => {
    if (!user) return;

    try {
      const newComment = await addComment(postId!, user.id, commentText, parentId);

      if (newComment) {
        const comment: Comment = {
          id: newComment.id,
          user: {
            name: user.name,
            initials: user.initials,
            avatarColor: user.avatarColor,
            avatar: user.avatar,
            verified: user.isVerified,
          },
          text: commentText,
          timestamp: 'now',
          likes: 0,
          replies: 0,
          isLiked: false,
          parentId: parentId,
        };
        setComments(prev => [comment, ...prev]);
        if (parentId) {
          setReplyingTo(null);
          setReplyText('');
        }
        triggerHaptic('light');
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment || !user) return;

    // Optimistic update
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 }
        : c
    ));
    triggerHaptic('light');

    try {
      if (comment.isLiked) {
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
      }
    } catch (error) {
      console.error('Error toggling comment like:', error);
      // Revert on error
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 }
          : c
      ));
    }
  };

  const handleCommentTap = (commentId: string, e: React.MouseEvent) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment || comment.userId !== user?.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCommentAction({
      commentId,
      position: { x: rect.left + rect.width / 2, y: rect.top },
    });
  };

  const handleEditComment = async (commentId: string, newText: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, text: newText } : c));
    try {
      const { error } = await supabase.from('comments').update({ content: newText }).eq('id', commentId);
      if (error) throw error;
      toast.success('Comment edited');
    } catch {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, text: comment.text } : c));
      toast.error('Failed to edit comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    setComments(prev => prev.filter(c => c.id !== commentId && c.parentId !== commentId));
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
      toast.success('Comment deleted');
    } catch {
      setComments(prev => [...prev, comment]);
      toast.error('Failed to delete comment');
    }
  };

  const isOwnPost = user?.id === post.user_id;

  const handleDeletePost = async () => {
    if (!postId) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      toast.success('Post deleted');
      navigate('/');
    } catch {
      toast.error('Failed to delete post');
    }
  };

  const handleEditPost = async () => {
    if (!postId || !editContent.trim()) return;
    try {
      const { error } = await supabase.from('posts').update({ content: editContent }).eq('id', postId);
      if (error) throw error;
      setPost((prev: any) => ({ ...prev, content: editContent }));
      setIsEditing(false);
      toast.success('Post updated');
    } catch {
      toast.error('Failed to update post');
    }
  };

  const handleSavePost = async () => {
    if (!user || !postId) return;
    if (saved) {
      await supabase.from('saves').delete().eq('post_id', postId).eq('user_id', user.id);
      setSaved(false);
      toast.success('Post unsaved');
    } else {
      await supabase.from('saves').insert({ post_id: postId, user_id: user.id });
      setSaved(true);
      toast.success('Post saved');
    }
    triggerHaptic('light');
  };

  const handleSharePost = async () => {
    if (navigator.share) {
      await navigator.share({ title: post.profiles.name, text: post.content, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied');
    }
  };

  const handleReportPost = async () => {
    if (!user || !postId) return;
    await supabase.from('abuse_reports').insert({
      reporter_user_id: user.id,
      reported_user_id: post.user_id,
      report_type: 'post',
      description: `Reported post ID: ${postId}`,
    });
    toast.success('Post reported');
  };

  const handleLikePost = async () => {
    if (!user) return;
    const newLikedState = !liked;
    setLiked(newLikedState);
    setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);
    triggerHaptic('light');
    await toggleLike(postId!, user.id, liked);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="p-2 h-auto"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-foreground">{post.profiles.name}</h1>
          <p className="text-sm text-muted-foreground">Post</p>
        </div>
      </header>

      {/* Post Content */}
      <main className="flex-1 flex flex-col">
        <article className="bg-card border-b border-border">
          {/* Post Header */}
          <div className="p-4 flex items-center gap-3">
            <div
              className="size-10 rounded-full grid place-items-center text-sm font-medium text-white overflow-hidden"
              style={{ backgroundColor: post.profiles.avatar_color }}
            >
              {post.profiles.avatar_url ? (
                <img src={post.profiles.avatar_url} alt={post.profiles.initials} className="w-full h-full object-cover" />
              ) : (
                post.profiles.initials
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-foreground">
                  {post.profiles.name}
                </h3>
                {post.profiles.is_verified && (
                  <BadgeCheck className="size-4 text-secondary" />
                )}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                {formatRelativeTime(post.created_at)}
                {post.location_text && (
                  <span className="flex items-center gap-0.5 text-primary">
                    <MapPin className="size-3" />
                    <span className="max-w-[160px] truncate">{post.location_text}</span>
                  </span>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isOwnPost && (
                  <>
                    <DropdownMenuItem onClick={() => { setEditContent(post.content); setIsEditing(true); }}>
                      <Pencil className="size-4 mr-2" /> Edit Post
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDeletePost} className="text-destructive focus:text-destructive">
                      <Trash2 className="size-4 mr-2" /> Delete Post
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSharePost}>
                  <Share2 className="size-4 mr-2" /> Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSavePost}>
                  {saved ? <BookmarkCheck className="size-4 mr-2" /> : <Bookmark className="size-4 mr-2" />}
                  {saved ? 'Unsave' : 'Save Post'}
                </DropdownMenuItem>
                {!isOwnPost && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleReportPost} className="text-destructive focus:text-destructive">
                      <Flag className="size-4 mr-2" /> Report
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Post Content */}
          <div className="px-4 pb-3">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[80px] p-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                  dir="auto"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleEditPost} disabled={!editContent.trim()}>Save</Button>
                </div>
              </div>
            ) : (
              <div className={cn(
                "text-[14px] text-foreground leading-relaxed break-words",
                !(/<[a-z][\s\S]*>/i.test(post.content) || post.content.includes('<p>') || post.content.includes('<strong>') || post.content.includes('<ul>')) && "whitespace-pre-wrap"
              )}>
                {(/<[a-z][\s\S]*>/i.test(post.content) || post.content.includes('<p>') || post.content.includes('<strong>') || post.content.includes('<ul>')) ? (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: post.content }} 
                  />
                ) : (
                  <p dir="auto">
                    {post.content.split(' ').map((word: string, i: number) =>
                      word.startsWith('#') ? <span key={i} className="text-primary font-medium">{word} </span> : word + ' '
                    )}
                  </p>
                )}
              </div>
            )}


            {post.tags && !isEditing && (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 rounded-full text-xs font-medium bg-gradient-subtle text-primary border border-primary/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Post Media - Multi-image/video carousel or single media */}
          {post.media_urls && post.media_urls.length > 0 ? (
            <div className="px-0 relative">
              <Carousel className="w-full" setApi={setDetailCarouselApi}>
                <CarouselContent>
                  {post.media_urls.map((url: string, index: number) => (
                    <CarouselItem key={index}>
                      <div className="relative overflow-hidden">
                        {/\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(url) ? (
                          <video
                            src={url}
                            className="w-full object-contain max-h-[70vh] bg-black"
                            controls
                            preload="metadata"
                            playsInline
                          />
                        ) : (
                          <img
                            src={url}
                            alt={`${post.media_alt || 'Post image'} ${index + 1}`}
                            className="w-full object-contain max-h-[70vh] bg-black/5"
                          />
                        )}
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {post.media_urls.length > 1 && (
                <>
                  <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-full z-10">
                    {detailCurrentSlide + 1}/{post.media_urls.length}
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {post.media_urls.map((_: string, idx: number) => (
                      <div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${idx === detailCurrentSlide
                            ? 'bg-primary w-4'
                            : 'bg-card/60 w-1.5'
                          }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : post.cover_image_url || post.media_url ? (
            <div className="px-0">
              <div className="relative overflow-hidden">
                {/\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(post.cover_image_url || post.media_url || '') ? (
                  <video
                    src={post.cover_image_url || post.media_url}
                    className="w-full object-contain max-h-[70vh] bg-black"
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <img
                    src={post.cover_image_url || post.media_url}
                    alt={post.media_alt || ""}
                    className="w-full object-contain max-h-[70vh] bg-black/5"
                  />
                )}
              </div>
            </div>
          ) : null}

          {/* Voice Note */}
          {post.voice_url && (
            <div className="px-4 py-2 flex items-center gap-2">
              <Mic className="size-4 text-primary shrink-0" />
              <audio controls src={post.voice_url} className="h-8 flex-1" preload="metadata" />
            </div>
          )}

          {/* Post Actions */}
          <div className="px-4 py-3 flex items-center gap-6 border-t border-border/40">
            <button
              onClick={handleLikePost}
              className="flex items-center gap-2 text-sm font-medium hover:text-red-500 transition-colors"
            >
              <Heart
                className={`size-5 transition-all ${liked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`}
              />
              <span>{formatCount(likesCount)}</span>
            </button>

            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              <MessageCircle className="size-5" />
              <span>{formatCount(comments.length)}</span>
            </button>

            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-secondary transition-colors">
              <Share2 className="size-5" />
              <span>{formatCount(post.post_stats?.shares_count || 0)}</span>
            </button>
          </div>
        </article>

        {/* Comments Section */}
        <section className="flex-1 bg-background">
          <div className="px-4 py-3 border-b border-border/40">
            <h2 className="font-semibold text-foreground">
              {formatCount(comments.filter(c => !c.parentId).length)} Comments
            </h2>
          </div>

          {/* Comments List */}
          <div className="flex-1 pb-20">
            {comments.filter(c => !c.parentId).map((comment) => (
              <div key={comment.id}>
                <div className="px-4 py-3 border-b border-border/40 cursor-pointer" onClick={(e) => handleCommentTap(comment.id, e)}>
                  <div className="flex gap-3">
                    <div
                      className="size-8 rounded-full grid place-items-center text-xs font-medium text-white shrink-0 overflow-hidden cursor-pointer"
                      style={{ backgroundColor: comment.user.avatarColor }}
                      onClick={() => comment.userId && navigate(`/profile/${comment.username || comment.userId}`)}
                    >
                      {comment.user.avatar ? (
                        <img src={comment.user.avatar} alt={comment.user.initials} className="w-full h-full object-cover" />
                      ) : (
                        comment.user.initials
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="font-medium text-sm text-foreground cursor-pointer hover:underline"
                          onClick={() => comment.userId && navigate(`/profile/${comment.username || comment.userId}`)}
                        >
                          {comment.user.name}
                        </span>
                        {comment.user.verified && (
                          <BadgeCheck className="size-3 text-secondary" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {comment.timestamp}
                        </span>
                      </div>

                      <p className="text-sm text-foreground mb-2">
                        {comment.text}
                      </p>

                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleLikeComment(comment.id)}
                          className="flex items-center gap-1 text-xs font-medium hover:text-red-500 transition-colors"
                        >
                          <Heart className={`size-3 ${comment.isLiked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                          {comment.likes > 0 && <span>{comment.likes}</span>}
                        </button>

                        <button
                          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Reply
                          {comments.filter(r => r.parentId === comment.id).length > 0 && (
                            <span className="ml-1">({comments.filter(r => r.parentId === comment.id).length})</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reply input */}
                {replyingTo === comment.id && (
                  <div className="px-4 py-2 ml-11 border-b border-border/30">
                    <div className="flex items-end gap-2">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Reply to ${comment.user.name}...`}
                        className="flex-1 text-sm bg-muted/50 rounded-full px-3 py-2 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && replyText.trim()) {
                            handleCommentSubmit(replyText.trim(), comment.id);
                          }
                          if (e.key === 'Escape') {
                            setReplyingTo(null);
                            setReplyText('');
                          }
                        }}
                        autoFocus
                      />
                      {replyText.trim() && (
                        <Button
                          size="sm"
                          className="h-8 px-3"
                          onClick={() => handleCommentSubmit(replyText.trim(), comment.id)}
                        >
                          <Send className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Replies */}
                {comments.filter(r => r.parentId === comment.id).map((reply) => (
                  <div key={reply.id} className="px-4 py-2 ml-11 border-b border-border/30 cursor-pointer" onClick={(e) => handleCommentTap(reply.id, e)}>
                    <div className="flex gap-2">
                      <div
                        className="size-6 rounded-full grid place-items-center text-[10px] font-medium text-white shrink-0 overflow-hidden cursor-pointer"
                        style={{ backgroundColor: reply.user.avatarColor }}
                        onClick={() => reply.userId && navigate(`/profile/${reply.username || reply.userId}`)}
                      >
                        {reply.user.avatar ? (
                          <img src={reply.user.avatar} alt={reply.user.initials} className="w-full h-full object-cover" />
                        ) : (
                          reply.user.initials
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="font-medium text-xs text-foreground cursor-pointer hover:underline"
                            onClick={() => reply.userId && navigate(`/profile/${reply.username || reply.userId}`)}
                          >{reply.user.name}</span>
                          {reply.user.verified && <BadgeCheck className="size-3 text-secondary" />}
                          <span className="text-xs text-muted-foreground">{reply.timestamp}</span>
                        </div>
                        <p className="text-xs text-foreground mb-1">{reply.text}</p>
                        <button
                          onClick={() => handleLikeComment(reply.id)}
                          className="flex items-center gap-1 text-xs font-medium hover:text-red-500 transition-colors"
                        >
                          <Heart className={`size-3 ${reply.isLiked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                          {reply.likes > 0 && <span>{reply.likes}</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Floating Comment Input */}
      <PersistentCommentComposer
        onSubmit={(text) => handleCommentSubmit(text)}
        recipientId={post?.user_id}
        recipientName={post?.profiles?.name}
        onGiftSend={async (gift: GiftEmoji) => {
          if (!post?.user_id || !user) return;
          try {
            await transferCoins.mutateAsync({
              receiverId: post.user_id,
              amount: gift.value,
              typeSent: 'tip_sent',
              typeReceived: 'tip_received',
              description: `Gift ${gift.emoji} ${gift.label} on post`,
            });
            const giftComment = `${gift.emoji} sent a ${gift.label} gift (${gift.value} 🪙)`;
            await handleCommentSubmit(giftComment);
          } catch (error) {
            console.error('Error sending gift:', error);
          }
        }}
      />
      {/* Comment Action Menu */}
      <CommentActionMenu
        isOpen={!!commentAction}
        isOwn={true}
        position={commentAction?.position || { x: 0, y: 0 }}
        commentText={comments.find(c => c.id === commentAction?.commentId)?.text || ''}
        onClose={() => setCommentAction(null)}
        onEdit={(newText) => commentAction && handleEditComment(commentAction.commentId, newText)}
        onDelete={() => commentAction && handleDeleteComment(commentAction.commentId)}
      />
    </div>
  );
};

export default PostDetail;