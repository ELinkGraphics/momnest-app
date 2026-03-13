import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Upload, Image as ImageIcon, Crown, DollarSign, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CreateCirclePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleId: string;
  onPostCreated: () => void;
}

export const CreateCirclePostModal: React.FC<CreateCirclePostModalProps> = ({
  isOpen,
  onClose,
  circleId,
  onPostCreated,
}) => {
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState<string>('');
  const [hasTipsEnabled, setHasTipsEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Cover image must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      setCoverImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeCoverImage = () => {
    setCoverImage(null);
    setCoverPreview('');
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please write something for your post",
        variant: "destructive",
      });
      return;
    }

    if (isPremium && (!premiumPrice || parseInt(premiumPrice) < 1)) {
      toast({
        title: "Price required",
        description: "Please set a coin price (minimum 1) for premium content",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let coverImageUrl = null;

      // Upload cover image if provided
      if (coverImage) {
        const fileExt = coverImage.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(fileName, coverImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('post-media')
          .getPublicUrl(uploadData.path);
        
        coverImageUrl = publicUrl;
      }

      // Create post
      const { error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          circle_id: circleId,
          content: content.trim(),
          cover_image_url: coverImageUrl,
          is_premium: isPremium,
          premium_price: isPremium ? parseInt(premiumPrice) : null,
          has_tips_enabled: hasTipsEnabled,
        });

      if (postError) throw postError;

      toast({
        title: "Post created!",
        description: isPremium ? "Your premium post is now live" : "Your post is now live",
      });

      setContent('');
      setCoverImage(null);
      setCoverPreview('');
      setIsPremium(false);
      setPremiumPrice('');
      setHasTipsEnabled(true);
      onPostCreated();
      onClose();
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
        title: "Failed to create post",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background/80 backdrop-blur-xl border-border/50 shadow-2xl rounded-3xl p-0 gap-0 overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/20">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Create Circle Post
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/80">
              Share exclusive content with your circle members
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-8">
          {/* Cover Image Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-foreground/80 ml-1">Cover Image</Label>
            {!coverPreview ? (
              <label className="group relative mt-2 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border/50 rounded-2xl cursor-pointer bg-muted/10 hover:bg-muted/20 hover:border-primary/50 transition-all duration-300">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="p-4 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <p className="mb-2 text-sm font-medium">
                    <span className="text-primary font-bold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP (MAX. 5MB)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleCoverImageSelect}
                />
              </label>
            ) : (
              <div className="group relative mt-2 w-full h-64 rounded-2xl overflow-hidden shadow-lg">
                <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <button
                    onClick={removeCoverImage}
                    className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-300 shadow-xl transform scale-90 group-hover:scale-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-foreground/80 ml-1">Post Content</Label>
            <div className="relative">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share something with your circle..."
                className="min-h-[180px] bg-muted/5 border-border/50 rounded-2xl p-4 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none text-base"
              />
              <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground/50 font-medium">
                {content.length} characters
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Premium Toggle Section */}
            <div className={`flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-300 ${isPremium ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-border/50 bg-muted/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-colors ${isPremium ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Crown className="w-5 h-5" />
                  </div>
                  <div>
                    <Label htmlFor="premium-toggle" className="text-sm font-semibold cursor-pointer">Premium Content</Label>
                    <p className="text-[11px] text-muted-foreground/70">Exclusive for paid users</p>
                  </div>
                </div>
                <Switch
                  id="premium-toggle"
                  checked={isPremium}
                  onCheckedChange={setIsPremium}
                />
              </div>

              {isPremium && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="premium-price" className="text-xs font-medium text-muted-foreground ml-1">Unlock Price (Coins)</Label>
                    <div className="relative">
                      <Input
                        id="premium-price"
                        type="number"
                        min="1"
                        max="10000"
                        value={premiumPrice}
                        onChange={(e) => setPremiumPrice(e.target.value)}
                        placeholder="50"
                        className="bg-background border-border/50 rounded-xl pl-9"
                      />
                      <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[10, 25, 50, 100, 500].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPremiumPrice(String(p))}
                        className={`px-4 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200 ${
                          premiumPrice === String(p)
                            ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                            : 'bg-background border-border/50 hover:border-primary/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p} 🪙
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tips Toggle Section */}
            <div className={`flex flex-col justify-center gap-4 p-5 rounded-2xl border transition-all duration-300 ${hasTipsEnabled ? 'border-emerald-500/30 bg-emerald-500/5 shadow-sm' : 'border-border/50 bg-muted/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-colors ${hasTipsEnabled ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <Label htmlFor="tips-toggle" className="text-sm font-semibold cursor-pointer">Enable Tips</Label>
                    <p className="text-[11px] text-muted-foreground/70">Allow members to tip you</p>
                  </div>
                </div>
                <Switch
                  id="tips-toggle"
                  checked={hasTipsEnabled}
                  onCheckedChange={setHasTipsEnabled}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4 pb-2">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-2xl border-border/50 font-semibold hover:bg-muted/30 transition-all"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="flex-[2] h-12 rounded-2xl bg-gradient-to-r from-primary to-primary/80 font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Creating Post...</span>
                </div>
              ) : 'Publish Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
