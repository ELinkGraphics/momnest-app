import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, X, Plus } from 'lucide-react';
import { type Circle } from '@/hooks/useCircles';
import { useCircleMutations } from '@/hooks/useCircleMutations';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import ImageCropper from '@/components/ImageCropper';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';

interface EditCircleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  circle: Circle;
  onSuccess?: () => void;
}

const EditCircleModal: React.FC<EditCircleModalProps> = ({ 
  open, 
  onOpenChange, 
  circle,
  onSuccess 
}) => {
  const { user } = useUser();
  const { updateCircle } = useCircleMutations();
  
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description);
  const [aboutSection, setAboutSection] = useState(circle.about_text || '');
  const [guidelines, setGuidelines] = useState<string[]>(
    circle.guidelines && circle.guidelines.length > 0 ? circle.guidelines : ['']
  );
  
  const avatarManager = useFileManager();
  const coverManager = useFileManager();
  
  const avatarFile = avatarManager.files[0]?.file as File | undefined;
  const avatarPreview = avatarManager.files[0]?.url;
  const coverFile = coverManager.files[0]?.file as File | undefined;
  const coverPreview = coverManager.files[0]?.url;

  // Update state when circle data changes or modal opens
  useEffect(() => {
    if (!open) return;
    
    setName(circle.name);
    setDescription(circle.description);
    setAboutSection(circle.about_text || '');
    setGuidelines(circle.guidelines && circle.guidelines.length > 0 ? circle.guidelines : ['']);
    
    // Initialize managers with existing URLs only if they are empty
    if (circle.avatar_url && avatarManager.files.length === 0) {
      avatarManager.setFiles([{
        id: 'existing-avatar',
        file: new File([], 'existing'),
        url: circle.avatar_url,
        status: 'idle',
        kind: 'image',
        name: 'existing',
        size: 0,
        mimeType: 'image/jpeg'
      }]);
    }
    if (circle.cover_image_url && coverManager.files.length === 0) {
      coverManager.setFiles([{
        id: 'existing-cover',
        file: new File([], 'existing'),
        url: circle.cover_image_url,
        status: 'idle',
        kind: 'image',
        name: 'existing',
        size: 0,
        mimeType: 'image/jpeg'
      }]);
    }
    // We only want this to run when the modal is opened or the data fundamentally changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle.id, open]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [cropperType, setCropperType] = useState<'avatar' | 'cover'>('avatar');

  // Handle file selection from CustomFilePicker for cropping
  useEffect(() => {
    if (avatarManager.files[0]?.file && avatarManager.files[0].id !== 'existing-avatar' && !cropperImage) {
      const file = avatarManager.files[0].file;
      const reader = new FileReader();
      reader.onloadend = () => { setCropperImage(reader.result as string); setCropperType('avatar'); };
      reader.readAsDataURL(file);
    }
  }, [avatarManager.files, cropperImage]); // Added cropperImage to dependencies

  useEffect(() => {
    if (coverManager.files[0]?.file && coverManager.files[0].id !== 'existing-cover' && !cropperImage) {
      const file = coverManager.files[0].file;
      const reader = new FileReader();
      reader.onloadend = () => { setCropperImage(reader.result as string); setCropperType('cover'); };
      reader.readAsDataURL(file);
    }
  }, [coverManager.files, cropperImage]); // Added cropperImage to dependencies
  
  // Removed native handlers in favor of CustomFilePicker managers

  const handleCropComplete = (blob: Blob) => {
    const file = new File([blob], `circle-${cropperType}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (cropperType === 'avatar') {
      avatarManager.setFiles([{
        id: 'cropped-avatar',
        file: file,
        url: URL.createObjectURL(blob),
        status: 'idle',
        kind: 'image',
        name: file.name,
        size: file.size,
        mimeType: file.type
      }]);
    } else {
      coverManager.setFiles([{
        id: 'cropped-cover',
        file: file,
        url: URL.createObjectURL(blob),
        status: 'idle',
        kind: 'image',
        name: file.name,
        size: file.size,
        mimeType: file.type
      }]);
    }
    setCropperImage(null);
  };

  const addGuideline = () => {
    setGuidelines([...guidelines, '']);
  };

  const updateGuideline = (index: number, value: string) => {
    const newGuidelines = [...guidelines];
    newGuidelines[index] = value;
    setGuidelines(newGuidelines);
  };

  const removeGuideline = (index: number) => {
    setGuidelines(guidelines.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    if (!name.trim()) {
      toast.error('Circle name is required');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const updates: any = {
        name: name.trim(),
        description: description.trim(),
        about_text: aboutSection.trim() || null,
        guidelines: guidelines.filter(g => g.trim() !== ''),
      };

      if (avatarFile && avatarFile.size > 0) updates.avatar = avatarFile;
      if (coverFile && coverFile.size > 0) updates.cover = coverFile;

      await updateCircle(circle.id, user.id, updates);
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error already handled in mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open && !cropperImage} onOpenChange={(val) => { if (!cropperImage) onOpenChange(val); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Circle</DialogTitle>
            <DialogDescription>
              Update your circle's information, cover image, and community guidelines
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* First Section - Basic Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Basic Information</h3>
              
              {/* Cover Image */}
              <div>
                <Label>Cover Image</Label>
                <CustomFilePicker manager={coverManager} hideUploadButton hidePreviewList accept="image/*" maxFileSizeMB={5}>
                  <div 
                    className="mt-2 relative w-full h-32 bg-muted rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CustomFilePicker>
                <p className="text-xs text-muted-foreground mt-1">Click to {coverPreview ? 'change' : 'add'} cover image</p>
              </div>

              {/* Profile Image */}
              <div>
                <Label>Profile Image</Label>
                <CustomFilePicker manager={avatarManager} hideUploadButton hidePreviewList accept="image/*" maxFileSizeMB={5}>
                  <div 
                    className="mt-2 relative w-24 h-24 bg-muted rounded-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity mx-auto"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground text-2xl font-bold">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CustomFilePicker>
                <p className="text-xs text-muted-foreground mt-1 text-center">Click to {avatarPreview ? 'change' : 'add'} profile image</p>
              </div>

              {/* Circle Name */}
              <div>
                <Label htmlFor="name">Circle Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter circle name"
                  className="mt-1"
                  required
                />
              </div>

              {/* Description/Bio */}
              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your circle..."
                  className="mt-1 min-h-[100px]"
                  required
                />
              </div>
            </div>

            {/* Second Section - About & Guidelines */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-lg">About & Guidelines</h3>
              
              {/* About Section */}
              <div>
                <Label htmlFor="about">About This Circle</Label>
                <Textarea
                  id="about"
                  value={aboutSection}
                  onChange={(e) => setAboutSection(e.target.value)}
                  placeholder="Additional information about your circle..."
                  className="mt-1 min-h-[100px]"
                />
              </div>

              {/* Community Guidelines */}
              <div>
                <Label>Community Guidelines</Label>
                <div className="space-y-2 mt-2">
                  {guidelines.map((guideline, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={guideline}
                        onChange={(e) => updateGuideline(index, e.target.value)}
                        placeholder={`Guideline ${index + 1}`}
                        className="flex-1"
                      />
                      {guidelines.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeGuideline(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addGuideline}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Guideline
                  </Button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          aspectRatio={cropperType === 'avatar' ? 1 : 16 / 9}
          cropShape={cropperType === 'avatar' ? 'round' : 'rect'}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImage(null)}
        />
      )}
    </>
  );
};

export default EditCircleModal;
