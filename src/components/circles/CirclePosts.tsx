import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TiptapUnderline from '@tiptap/extension-underline';
import TiptapLink from '@tiptap/extension-link';
import { Heart, MessageCircle, Crown, Bookmark, Lock, MoreVertical, Trash2, Image as ImageIcon, Coins, Send, X, Bold, Italic, Underline as UnderlineIcon, List, Heading1, Heading2, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TipButton } from './TipButton';
import { PremiumSettingsModal } from './PremiumSettingsModal';
import { SubscribeCircleModal } from './SubscribeCircleModal';
import { EditPostModal } from './EditPostModal';
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

  // Inline Composer State
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState('50');
  const [hasTipsEnabled, setHasTipsEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPostForEdit, setSelectedPostForEdit] = useState<any>(null);

  // Initialize Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      TiptapUnderline,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert focus:outline-none min-h-[100px] w-full text-lg placeholder:text-muted-foreground/50',
      },
    },
  });

  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  
  const { data: posts = [], isLoading } = useCirclePosts(circleId);
  const { data: subscription } = useCircleSubscription(circleId);

  const hasSubscription = !!subscription;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Image must be less than 5MB", variant: "destructive" });
        return;
      }
      setCoverImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setCoverImage(null);
    setCoverPreview('');
  };

  const handleSubmit = async () => {
    if (!content.trim() && !coverImage) {
      toast({ title: "Content required", description: "Please write something or add an image", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let coverImageUrl = null;
      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('post-media').upload(fileName, coverImage);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(uploadData.path);
        coverImageUrl = publicUrl;
      }

      const { error: postError } = await supabase.from('posts').insert({
        user_id: user.id,
        circle_id: circleId,
        content: content.trim(),
        cover_image_url: coverImageUrl,
        is_premium: isPremium,
        premium_price: isPremium ? parseInt(premiumPrice) : null,
        has_tips_enabled: hasTipsEnabled,
      });

      if (postError) throw postError;

      toast({ title: "Post published!", description: isPremium ? `Premium post set at ${premiumPrice} coins` : "Your post is now live" });
      
      // Reset state
      setCoverPreview('');
      setIsPremium(false);
      setHasTipsEnabled(true);
      editor?.commands.setContent('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({ title: "Failed to publish", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReadMore = (post: any) => {
    if (hasSubscription || isOwner || post.user_has_unlocked) {
      navigate(`/circle/${circleId}/post/${post.id}`);
      return;
    }
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
      const query = supabase.from('posts').delete().eq('id', postId);
      if (!isOwner) query.eq('user_id', user.id);
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
      {/* Inline Post Composer - Only for Owners */}
      {isOwner && (
        <div className="px-4 py-8 bg-muted/40 border-b border-border/50 animate-fade-in transition-all">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="relative bg-card/60 backdrop-blur-xl rounded-3xl p-4 border border-border/50 shadow-xl shadow-primary/5 group transition-all duration-300 hover:border-primary/30">
              <div className="flex gap-4">
                {/* User Avatar / Owner Role icon */}
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 flex-shrink-0">
                  <Crown className="w-6 h-6" />
                </div>
                
                {/* Text Area / Rich Text Editor */}
                <div className="flex-1 space-y-3 pt-1 min-h-[100px]">
                  {editor && (
                    <BubbleMenu editor={editor} className="flex items-center gap-1 p-1.5 bg-card/90 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                      <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('bold') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('italic') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <Italic className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('underline') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <UnderlineIcon className="w-4 h-4" />
                      </button>
                      <div className="w-px h-4 bg-border/50 mx-1" />
                      <button
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('heading', { level: 1 }) ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <Heading1 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('bulletList') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <div className="w-px h-4 bg-border/50 mx-1" />
                      <button
                        onClick={() => {
                          const url = window.prompt('URL');
                          if (url) editor.chain().focus().setLink({ href: url }).run();
                        }}
                        className={`p-2 rounded-xl transition-all ${editor.isActive('link') ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted/30 text-muted-foreground'}`}
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </BubbleMenu>
                  )}
                  
                  <div className="relative">
                    {!content.trim() || content === '<p></p>' ? (
                      <div className="absolute top-0 left-0 text-muted-foreground/50 text-lg pointer-events-none">
                        What's on your mind, Creator?
                      </div>
                    ) : null}
                    <EditorContent editor={editor} />
                  </div>
                  
                  {/* Image Preview */}
                  {coverPreview && (
                    <div className="relative w-full h-48 rounded-2xl overflow-hidden shadow-md group/img">
                      <img src={coverPreview} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={removeImage}
                        className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/30 gap-2 flex-nowrap overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      {/* Add Image */}
                      <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-muted/20 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all cursor-pointer flex-shrink-0">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Image</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} />
                      </label>

                      {/* Premium Toggle */}
                      <button 
                        onClick={() => {
                          if (!isPremium) {
                            setIsPremiumModalOpen(true);
                          } else {
                            setIsPremium(false);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-xl transition-all flex-shrink-0 ${
                          isPremium 
                            ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/50' 
                            : 'bg-muted/20 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500'
                        }`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{isPremium ? `${premiumPrice}` : 'Premium'}</span>
                      </button>

                      {/* Tips Toggle */}
                      <button 
                        onClick={() => setHasTipsEnabled(!hasTipsEnabled)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-xl transition-all flex-shrink-0 ${
                          hasTipsEnabled 
                            ? 'bg-emerald-500/20 text-emerald-500 ring-1 ring-emerald-500/50' 
                            : 'bg-muted/20 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500'
                        }`}
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Tips</span>
                      </button>
                    </div>

                    {/* Post Button - Moved to the right corner */}
                    <Button 
                      onClick={handleSubmit}
                      disabled={isSubmitting || (!content.trim() && !coverImage)}
                      className="h-9 px-5 rounded-xl bg-gradient-to-r from-primary to-primary/80 font-bold shadow-md shadow-primary/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex-shrink-0"
                    >
                      {isSubmitting ? (
                        <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Post</span>
                          <Send className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
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
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-10 flex items-center justify-center cursor-pointer" onClick={() => navigate(`/circle/${circleId}/post/${post.id}`)}>
                      <div className="text-center space-y-4">
                        <Lock className="w-16 h-16 mx-auto text-white" />
                        <div>
                          <h4 className="text-xl font-bold text-white mb-2">Premium Content</h4>
                          <p className="text-white/80 text-sm">Tap to unlock or subscribe</p>
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
                        <DropdownMenuItem onClick={() => {
                          setSelectedPostForEdit(post);
                          setIsEditModalOpen(true);
                        }}>
                          <Pencil className="size-4 mr-2" />
                          Edit Post
                        </DropdownMenuItem>
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
                    <div className="text-white/90 text-sm leading-relaxed mb-4 line-clamp-2 overflow-hidden prose prose-sm prose-invert max-w-none">
                      {canView ? (
                        post.content.includes('<') ? (
                          <div dangerouslySetInnerHTML={{ __html: post.content }} />
                        ) : (
                          <p>
                            {post.content.split(' ').map((word: string, i: number) =>
                              word.startsWith('#') ? <span key={i} className="text-primary-foreground/80 font-medium">{word} </span> : word + ' '
                            )}
                          </p>
                        )
                      ) : 'Tap to unlock exclusive content with coins or subscribe for full access...'}
                    </div>

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
                      onClick={() => navigate(`/circle/${circleId}/post/${post.id}`)}
                      className="w-full rounded-full py-3 px-6 text-base font-semibold bg-card text-foreground shadow-glow hover:shadow-xl hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    >
                      {!canView ? (
                        <>
                          <Lock className="w-4 h-4 inline mr-2" />
                          Unlock or Subscribe
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
      <PremiumSettingsModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        price={premiumPrice}
        setPrice={setPremiumPrice}
        onSave={() => {
          setIsPremium(true);
          setIsPremiumModalOpen(false);
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

      <EditPostModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        post={selectedPostForEdit}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] });
        }}
      />
    </div>
  );
};

export default CirclePosts;