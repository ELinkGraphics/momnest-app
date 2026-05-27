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
import { storyService } from '@/services/storyService';

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

    // Clear the active file immediately to prevent useEffect from re-opening the editor
    if (storyManager.files[0]) {
      storyManager.removeFile(storyManager.files[0].id);
    }

    setShowEditor(false);
    setIsUploading(true);

    try {
      const isVideo = extraData?.mediaType === 'video' && extraData?.originalVideoUrl;
      await storyService.createStory(user.id, editedBlob, isVideo, mentionedUserIds, extraData);

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

  const handleEditorCancel = () => {
    if (storyManager.files[0]) {
      storyManager.removeFile(storyManager.files[0].id);
    }
    setShowEditor(false);
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
      const isVideo = selectedMedia.type.startsWith('video/');
      await storyService.createStory(user.id, selectedMedia, isVideo, pendingMentionIds);

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

      {/* Hide the modal UI when editor is open so it doesn't cover the editor */}
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/80 ${showEditor ? 'hidden' : ''}`}>
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
