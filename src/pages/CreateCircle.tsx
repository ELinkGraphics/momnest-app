import React, { useState, useRef } from 'react';
import { ArrowLeft, Camera, Users, Globe, Lock, MapPin, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCircleMutations } from '@/hooks/useCircleMutations';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import InviteLinkModal from '@/components/circles/InviteLinkModal';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';
import { useEffect } from 'react';

const CreateCircle: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { createCircle, isCreating } = useCircleMutations();
  const [circleName, setCircleName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [errors, setErrors] = useState<{ name?: boolean; description?: boolean; category?: boolean }>({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const circleManager = useFileManager();
  const avatarFile = circleManager.files[0]?.file as File | undefined;
  const avatarPreview = circleManager.files[0]?.url;
  const [createdCircle, setCreatedCircle] = useState<{ id: string; invite_code: string; name: string } | null>(null);

  // Native handlers removed in favor of CustomFilePicker manager

  const handleCreate = async () => {
    if (!user) {
      toast.error('You must be logged in to create a circle');
      return;
    }

    const newErrors = {
      name: !circleName.trim(),
      description: !description.trim(),
      category: !category,
    };
    setErrors(newErrors);

    if (newErrors.name || newErrors.description || newErrors.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const circle = await createCircle({
        name: circleName,
        description: description,
        category: category,
        location: location || undefined,
        is_private: privacy === 'private',
        avatar: avatarFile || undefined,
      }, user.id);

      toast.success('Circle created successfully!');
      
      if (privacy === 'private' && circle.invite_code) {
        setCreatedCircle({ id: circle.id, invite_code: circle.invite_code, name: circleName });
        setShowInviteModal(true);
      } else {
        navigate(`/circle/${circle.id}`);
      }
    } catch (error) {
      // Error already handled in mutation
    }
  };

  const categories = [
    'Community',
    'Sports',
    'Education',
    'Technology',
    'Art & Design',
    'Music',
    'Business',
    'Health & Wellness',
    'Travel',
    'Food & Cooking',
    'Gaming',
    'Other'
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-lg font-semibold">Create Circle</h1>
          <Button 
            onClick={handleCreate}
            disabled={isCreating}
            className="px-6"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        <div className="text-center">
          <CustomFilePicker manager={circleManager} hideUploadButton hidePreviewList accept="image/*" maxFileSizeMB={5}>
            <div 
              className="w-24 h-24 mx-auto rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group overflow-hidden"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Circle avatar" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </div>
          </CustomFilePicker>
          <p className="text-sm text-muted-foreground mt-2">
            {avatarPreview ? 'Change circle photo' : 'Add circle photo (optional)'}
          </p>
        </div>

        {/* Circle Name */}
        <div className="space-y-2">
          <Label htmlFor="circle-name">Circle Name <span className="text-destructive">*</span></Label>
          <Input
            id="circle-name"
            placeholder="Enter circle name"
            value={circleName}
            onChange={(e) => { setCircleName(e.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: false })); }}
            className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {errors.name && <p className="text-xs text-destructive">Circle name is required</p>}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
          <Textarea
            id="description"
            placeholder="Describe what your circle is about..."
            value={description}
            onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors(prev => ({ ...prev, description: false })); }}
            className={`min-h-[100px] ${errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          {errors.description && <p className="text-xs text-destructive">Description is required</p>}
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location (Optional)</Label>
          <Input
            id="location"
            placeholder="e.g., San Francisco, CA or Online"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
          <select
            id="category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); if (errors.category) setErrors(prev => ({ ...prev, category: false })); }}
            className={`w-full p-2 border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${errors.category ? 'border-destructive' : 'border-border'}`}
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-xs text-destructive">Please select a category</p>}
        </div>

        {/* Privacy Settings */}
        <div className="space-y-2">
          <Label>Privacy</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPrivacy('public')}
              className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors ${
                privacy === 'public'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Globe className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">Public</p>
                <p className="text-xs text-muted-foreground">Anyone can join</p>
              </div>
            </button>
            
            <button
              onClick={() => setPrivacy('private')}
              className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors ${
                privacy === 'private'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Lock className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">Private</p>
                <p className="text-xs text-muted-foreground">Invite only</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {createdCircle && (
        <InviteLinkModal
          open={showInviteModal}
          onOpenChange={(open) => {
            setShowInviteModal(open);
            if (!open) navigate(`/circle/${createdCircle.id}`);
          }}
          inviteCode={createdCircle.invite_code}
          circleName={createdCircle.name}
        />
      )}
    </div>
  );
};

export default CreateCircle;
