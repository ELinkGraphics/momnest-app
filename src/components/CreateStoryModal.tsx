import React, { useState } from 'react';
import { X, Camera, Image as ImageIcon, Video, Upload } from 'lucide-react';
import { VideoLoader } from '@/components/ui/VideoLoader';
import { Button } from '@/components/ui/button';
import { useUser } from '@/contexts/UserContext';
import { toast } from '@/hooks/use-toast';
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
  const [isUploading, setIsUploading] = useState(false);
  const storyManager = useFileManager();

  // Editor state — supports both images and videos
  const [showEditor, setShowEditor] = useState(false);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string>('');
  const [editorMediaType, setEditorMediaType] = useState<'image' | 'video'>('image');

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
          </div>

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
