import React, { useState, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Video, Upload } from 'lucide-react';
import { VideoLoader, InlineVideoLoader } from '@/components/ui/VideoLoader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/contexts/UserContext';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import StoryEditor from '@/components/story/StoryEditor';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateStory: (storyData: any) => void;
}

const CreateStoryModal: React.FC<CreateStoryModalProps> = ({ isOpen, onClose, onCreateStory }) => {
  const { user } = useUser();
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const storyManager = useFileManager();

  // Editor state — supports both images and videos
  const [showEditor, setShowEditor] = useState(false);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string>('');
  const [editorMediaType, setEditorMediaType] = useState<'image' | 'video'>('image');
  const [pendingMentionIds, setPendingMentionIds] = useState<string[]>([]);

  React.useEffect(() => {
    const activeFile = storyManager.files[0];
    if (activeFile && !showEditor) {
      setCroppedPreviewUrl(activeFile.url);
      setEditorMediaType(activeFile.kind === 'video' ? 'video' : 'image');
      setShowEditor(true);
    }
  }, [storyManager.files, showEditor]);

  if (!isOpen) return null;

  const handleEditorDone = async (editedBlob: Blob, mentionedUserIds?: string[], extraData?: any) => {
    if (!user) {
      toast({ title: "Not authenticated", description: "Please log in to create a story.", variant: "destructive" });
      return;
    }

    setShowEditor(false);
    setIsUploading(true);

    try {
      

      const isVideo = extraData?.mediaType === 'video' && extraData?.originalVideoUrl;

      let publicUrl: string;
      let overlayPublicUrl: string | null = null;

      if (isVideo) {
        // For video stories: upload the original video
        const videoBlob = await fetch(extraData.originalVideoUrl).then(r => r.blob());
        const videoFile = new File([videoBlob], `story-${Date.now()}.mp4`, { type: 'video/mp4' });
        const videoPath = `${user.id}/${Date.now()}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from('story-media')
          .upload(videoPath, videoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        publicUrl = supabase.storage.from('story-media').getPublicUrl(videoPath).data.publicUrl;

        // Upload transparent overlay PNG if present (contains stickers, text, images on top of video)
        if (extraData.overlayBlob) {
          const overlayFile = new File([extraData.overlayBlob], `overlay-${Date.now()}.png`, { type: 'image/png' });
          const overlayPath = `${user.id}/overlay-${Date.now()}.png`;

          const { error: overlayUploadError } = await supabase.storage
            .from('story-media')
            .upload(overlayPath, overlayFile, { cacheControl: '3600', upsert: false });
          if (overlayUploadError) throw overlayUploadError;

          overlayPublicUrl = supabase.storage.from('story-media').getPublicUrl(overlayPath).data.publicUrl;
        }
      } else {
        // For image stories: upload the canvas snapshot
        const file = new File([editedBlob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const filePath = `${user.id}/${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('story-media')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        publicUrl = supabase.storage.from('story-media').getPublicUrl(filePath).data.publicUrl;
      }

      // Build sticker_data including overlay URL, video transform, and background gradient
      const stickerDataPayload = extraData?.stickerData || [];
      const metaEntries: any[] = [];
      
      if (overlayPublicUrl) {
        metaEntries.push({ type: 'overlay', content: overlayPublicUrl, x: 0, y: 0 });
      }
      if (extraData?.videoTransform) {
        metaEntries.push({ type: 'video_transform', ...extraData.videoTransform });
      }
      if (extraData?.backgroundGradient) {
        metaEntries.push({ type: 'background_gradient', from: extraData.backgroundGradient.from, to: extraData.backgroundGradient.to });
      }

      const finalStickerData = [...stickerDataPayload, ...metaEntries].length > 0
        ? [...stickerDataPayload, ...metaEntries]
        : null;

      const { data: storyData, error: dbError } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: isVideo ? 'video' : 'image',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        sticker_data: finalStickerData,
      } as any).select('id').single();

      if (dbError) throw dbError;

      // Save mentions
      if (storyData && mentionedUserIds && mentionedUserIds.length > 0) {
        await supabase.from('story_mentions').insert(
          mentionedUserIds.map(uid => ({ story_id: storyData.id, mentioned_user_id: uid }))
        );
        for (const mentionedUserId of mentionedUserIds) {
          await supabase.from('push_notifications').insert([{
            user_id: mentionedUserId,
            notification_type: 'story_mention',
            title: `${user.name} mentioned you in their story`,
            body: 'Tap to view and reshare to your story',
            data: JSON.stringify({ type: 'story_mention', story_id: storyData.id, mentioner_id: user.id }),
          }]);
        }
      }

      onCreateStory(null);
      toast({ title: "Story created!", description: "Your story has been shared successfully." });
      setSelectedMedia(null);
      setPreviewUrl('');
      setCaption('');
      onClose();
    } catch (error) {
      console.error('Story creation error:', error);
      toast({ title: "Upload failed", description: "Could not create your story. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      
      // Clear the active file so it can be picked again
      if (storyManager.files[0]) {
        storyManager.removeFile(storyManager.files[0].id);
      }
    }
  };

  const handleEditorCancel = () => {
    setShowEditor(false);
    if (storyManager.files[0]) {
      storyManager.removeFile(storyManager.files[0].id);
    }
  };

  const handleCreateStory = async () => {
    if (!selectedMedia) {
      toast({ title: "No media selected", description: "Please select an image or video for your story.", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Not authenticated", description: "Please log in to create a story.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = selectedMedia.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      

      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(filePath, selectedMedia, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('story-media').getPublicUrl(filePath);

      const { data: storyData, error: dbError } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: selectedMedia.type.startsWith('video/') ? 'video' : 'image',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).select('id').single();

      if (dbError) throw dbError;

      // Save mentions and send notifications
      if (storyData && pendingMentionIds.length > 0) {
        await supabase.from('story_mentions').insert(
          pendingMentionIds.map(uid => ({ story_id: storyData.id, mentioned_user_id: uid }))
        );
        // Send notification to each mentioned user
        for (const mentionedUserId of pendingMentionIds) {
          await supabase.from('push_notifications').insert([{
            user_id: mentionedUserId,
            notification_type: 'story_mention',
            title: `${user.name} mentioned you in their story`,
            body: 'Tap to view and reshare to your story',
            data: JSON.stringify({ type: 'story_mention', story_id: storyData.id, mentioner_id: user.id }),
          }]);
        }
        setPendingMentionIds([]);
      }

      onCreateStory(null);
      toast({ title: "Story created!", description: "Your story has been shared successfully." });
      setSelectedMedia(null);
      setPreviewUrl('');
      setCaption('');
      onClose();
    } catch (error) {
      console.error('Story creation error:', error);
      toast({ title: "Upload failed", description: "Could not create your story. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {/* Story Editor (fullscreen, above everything) */}
      {showEditor && croppedPreviewUrl && (
        <StoryEditor
          previewUrl={croppedPreviewUrl}
          mediaType={editorMediaType}
          onDone={handleEditorDone}
          onCancel={handleEditorCancel}
        />
      )}

      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
        <div className="bg-background rounded-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden relative">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Create Story</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-muted transition-colors">
              <X className="size-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
            {!selectedMedia ? (
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <div className="flex justify-center gap-4 mb-4">
                  <Camera className="size-8 text-muted-foreground" />
                  <ImageIcon className="size-8 text-muted-foreground" />
                  <Video className="size-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">Share a moment from your day</p>
                <CustomFilePicker manager={storyManager} hideUploadButton hidePreviewList accept="image/*,video/*">
                  <Button className="w-full">
                    <Upload className="size-4 mr-2" /> Choose Photo or Video
                  </Button>
                </CustomFilePicker>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[9/16] bg-muted rounded-xl overflow-hidden">
                  {selectedMedia.type.startsWith('image/') || selectedMedia.type === 'image/jpeg' ? (
                    <>
                      <img src={previewUrl} alt="Story preview" className="w-full h-full object-cover" />
                      {/* Re-edit button */}
                      <button
                        onClick={() => { setCroppedPreviewUrl(previewUrl); setShowEditor(true); }}
                        className="absolute bottom-2 left-2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs font-medium backdrop-blur-sm hover:bg-black/70 transition-colors"
                      >
                        ✏️ Edit
                      </button>
                    </>
                  ) : (
                    <video src={previewUrl} className="w-full h-full object-cover" controls />
                  )}
                  <button
                    onClick={() => { setSelectedMedia(null); setPreviewUrl(''); }}
                    className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Add a caption (optional)</label>
                  <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What's on your mind?" className="resize-none" rows={3} maxLength={150} />
                  <p className="text-xs text-muted-foreground text-right">{caption.length}/150</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedMedia && (
            <div className="p-4 border-t border-border bg-muted/50">
              <Button onClick={handleCreateStory} disabled={isUploading} className="w-full">
                {isUploading ? (
                  <span className="flex items-center gap-2"><InlineVideoLoader />Uploading...</span>
                ) : 'Share Story'}
              </Button>
            </div>
          )}

          {/* Upload animation overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-2xl">
              <VideoLoader size="lg" label="Uploading story..." sublabel="Please wait" />
            </div>
          )}
        </div>
      </div>

    </>
  );
};

export default CreateStoryModal;
