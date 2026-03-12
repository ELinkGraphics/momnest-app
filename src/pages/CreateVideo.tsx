import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Video, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useVideoMutations } from "@/hooks/useVideoMutations";

const CreateVideo = () => {
  const navigate = useNavigate();
  const { createVideo } = useVideoMutations();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>("");
  const [thumbnailPreview, setThumbnailPreview] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video file size must be less than 100MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast.error("Please select a valid video file");
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file");
      return;
    }

    setThumbnailFile(file);
    const url = URL.createObjectURL(file);
    setThumbnailPreview(url);
  };

  const handleRemoveVideo = () => {
    setVideoFile(null);
    setVideoPreview("");
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  };

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview("");
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!videoFile) {
      toast.error("Please select a video file");
      return;
    }

    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (title.length > 100) {
      toast.error("Title must be less than 100 characters");
      return;
    }

    if (description.length > 500) {
      toast.error("Description must be less than 500 characters");
      return;
    }

    setIsUploading(true);

    const tagsArray = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const result = await createVideo({
      video: videoFile,
      thumbnail: thumbnailFile || undefined,
      title: title.trim(),
      description: description.trim() || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined
    });

    setIsUploading(false);

    if (result?.success) {
      navigate('/', { state: { feedMode: 'relax' } });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/', { state: { feedMode: 'feed' } })}
              className="p-2 hover:bg-accent rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Upload Video</h1>
            <Button
              onClick={handleSubmit}
              disabled={!videoFile || !title.trim() || isUploading}
              size="sm"
            >
              {isUploading ? "Uploading..." : "Post"}
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Video Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Video *</label>
            {!videoPreview ? (
              <div
                onClick={() => videoInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              >
                <Video className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Select a video to upload</p>
                <p className="text-xs text-muted-foreground">MP4, MOV, AVI, WebM (Max 100MB)</p>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  src={videoPreview}
                  controls
                  className="w-full max-h-96"
                />
                <button
                  onClick={handleRemoveVideo}
                  className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
              onChange={handleVideoSelect}
              className="hidden"
            />
          </div>

          {/* Thumbnail Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Thumbnail (Optional)</label>
            {!thumbnailPreview ? (
              <div
                onClick={() => thumbnailInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              >
                <Image className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Add custom thumbnail</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP</p>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden">
                <img
                  src={thumbnailPreview}
                  alt="Thumbnail preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={handleRemoveThumbnail}
                  className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleThumbnailSelect}
              className="hidden"
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your video a catchy title..."
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/100
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (Optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell viewers what your video is about..."
              maxLength={500}
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/500
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (Optional)</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comedy, dance, tutorial (comma separated)"
            />
            <p className="text-xs text-muted-foreground">
              Separate tags with commas to help people discover your video
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateVideo;
