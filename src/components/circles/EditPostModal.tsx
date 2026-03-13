import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TiptapUnderline from '@tiptap/extension-underline';
import TiptapLink from '@tiptap/extension-link';
import { X, Bold, Italic, Underline as UnderlineIcon, List, Heading1, Heading2, Link as LinkIcon, Crown, Coins, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: any;
  onSave: () => void;
}

export const EditPostModal: React.FC<EditPostModalProps> = ({ isOpen, onClose, post, onSave }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPremium, setIsPremium] = useState(post?.is_premium || false);
  const [premiumPrice, setPremiumPrice] = useState(post?.premium_price?.toString() || '50');
  const [hasTipsEnabled, setHasTipsEnabled] = useState(post?.has_tips_enabled ?? true);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>(post?.cover_image_url || '');

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
    content: post?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert focus:outline-none min-h-[150px] w-full text-lg placeholder:text-muted-foreground/50 p-4 bg-muted/20 rounded-2xl border border-border/50',
      },
    },
  });

  useEffect(() => {
    if (editor && post) {
      editor.commands.setContent(post.content);
      setIsPremium(post.is_premium);
      setPremiumPrice(post.premium_price?.toString() || '50');
      setHasTipsEnabled(post.has_tips_enabled ?? true);
      setCoverPreview(post.cover_image_url || '');
    }
  }, [post, editor]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }
      setCoverImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpdate = async () => {
    if (!editor || isSubmitting) return;

    const content = editor.getHTML();
    if (!content.trim() && !coverPreview) {
      toast.error("Please add some content or an image");
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCoverUrl = post.cover_image_url;

      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `${post.user_id}-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('post-media').upload(fileName, coverImage);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(uploadData.path);
        finalCoverUrl = publicUrl;
      }

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          content: content.trim(),
          cover_image_url: finalCoverUrl,
          is_premium: isPremium,
          premium_price: isPremium ? parseInt(premiumPrice) : null,
          has_tips_enabled: hasTipsEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      if (updateError) throw updateError;

      toast.success("Post updated successfully!");
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error updating post:', error);
      toast.error(error.message || "Failed to update post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl rounded-[2rem] overflow-hidden p-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="p-6 pb-2 border-b border-border/30">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Edit Post
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Editor Area */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-muted-foreground ml-1 uppercase tracking-wider">Content</label>
            <div className="relative group">
              {editor && (
                <BubbleMenu editor={editor} className="flex items-center gap-1 p-1.5 bg-card/90 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl">
                  <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded-xl transition-all ${editor.isActive('bold') ? 'bg-primary text-white' : 'hover:bg-muted/30 text-muted-foreground'}`}><Bold className="w-4 h-4" /></button>
                  <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 rounded-xl transition-all ${editor.isActive('italic') ? 'bg-primary text-white' : 'hover:bg-muted/30 text-muted-foreground'}`}><Italic className="w-4 h-4" /></button>
                  <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-2 rounded-xl transition-all ${editor.isActive('underline') ? 'bg-primary text-white' : 'hover:bg-muted/30 text-muted-foreground'}`}><UnderlineIcon className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-border/50 mx-1" />
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-xl transition-all ${editor.isActive('heading', { level: 1 }) ? 'bg-primary text-white' : 'hover:bg-muted/30 text-muted-foreground'}`}><Heading1 className="w-4 h-4" /></button>
                  <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded-xl transition-all ${editor.isActive('bulletList') ? 'bg-primary text-white' : 'hover:bg-muted/30 text-muted-foreground'}`}><List className="w-4 h-4" /></button>
                </BubbleMenu>
              )}
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Image Preview / Upload */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-muted-foreground ml-1 uppercase tracking-wider">Cover Image</label>
            {coverPreview && (
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden group shadow-lg border border-border/30">
                <img src={coverPreview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <label className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white cursor-pointer hover:bg-white/30 transition-all">
                    <ImageIcon className="w-6 h-6" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} />
                  </label>
                  <button onClick={() => { setCoverImage(null); setCoverPreview(''); }} className="p-3 bg-red-500/20 backdrop-blur-md rounded-full text-white hover:bg-red-500/40 transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}
            {!coverPreview && (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border/50 rounded-2xl bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer group">
                <ImageIcon className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
                <p className="mt-2 text-sm text-muted-foreground font-medium">Add Cover Image</p>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} />
              </label>
            )}
          </div>

          {/* Settings Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Premium Settings */}
            <div className="p-4 bg-muted/20 border border-border/30 rounded-[1.5rem] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-sm">Premium Post</span>
                </div>
                <button 
                  onClick={() => setIsPremium(!isPremium)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isPremium ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isPremium ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {isPremium && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex-1 relative">
                    <input 
                      type="number" 
                      value={premiumPrice}
                      onChange={(e) => setPremiumPrice(e.target.value)}
                      className="w-full h-10 bg-background border border-border/50 rounded-xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                      placeholder="Price"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground uppercase">Coins</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tips Toggle */}
            <div className="p-4 bg-muted/20 border border-border/30 rounded-[1.5rem] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-sm">Enable Tips</span>
              </div>
              <button 
                onClick={() => setHasTipsEnabled(!hasTipsEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${hasTipsEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${hasTipsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-muted/10 border-t border-border/30 flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl font-bold hover:bg-muted/40 transition-all"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpdate}
            disabled={isSubmitting}
            className="flex-[2] h-12 rounded-2xl bg-gradient-to-r from-primary to-primary/80 font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
