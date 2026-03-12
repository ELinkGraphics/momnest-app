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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Circle Post</DialogTitle>
          <DialogDescription>Share content with your circle members</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Cover Image Upload */}
          <div>
            <Label>Cover Image (Optional)</Label>
            {!coverPreview ? (
              <label className="mt-2 flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-smooth">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WEBP (MAX. 5MB)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleCoverImageSelect}
                />
              </label>
            ) : (
              <div className="relative mt-2 w-full h-60 rounded-lg overflow-hidden">
                <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                <button
                  onClick={removeCoverImage}
                  className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-smooth"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <Label>Post Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share something with your circle..."
              className="mt-2 min-h-[150px]"
            />
          </div>

          {/* Premium Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary" />
              <div>
                <Label htmlFor="premium-toggle" className="cursor-pointer">Premium Content</Label>
                <p className="text-xs text-muted-foreground">Only paid users can view full content</p>
              </div>
            </div>
            <Switch
              id="premium-toggle"
              checked={isPremium}
              onCheckedChange={setIsPremium}
            />
          </div>

          {/* Premium Price Input */}
          {isPremium && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3 mb-3">
                <Coins className="w-5 h-5 text-primary" />
                <div>
                  <Label htmlFor="premium-price">Unlock Price (Coins)</Label>
                  <p className="text-xs text-muted-foreground">How many coins readers must pay to unlock this post</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="premium-price"
                  type="number"
                  min="1"
                  max="10000"
                  value={premiumPrice}
                  onChange={(e) => setPremiumPrice(e.target.value)}
                  placeholder="e.g. 50"
                  className="max-w-[160px]"
                />
                <span className="text-sm text-muted-foreground">🪙 coins</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100, 500].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPremiumPrice(String(p))}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      premiumPrice === String(p)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p} 🪙
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tips Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-primary" />
              <div>
                <Label htmlFor="tips-toggle" className="cursor-pointer">Enable Tips</Label>
                <p className="text-xs text-muted-foreground">Allow members to tip you</p>
              </div>
            </div>
            <Switch
              id="tips-toggle"
              checked={hasTipsEnabled}
              onCheckedChange={setHasTipsEnabled}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
