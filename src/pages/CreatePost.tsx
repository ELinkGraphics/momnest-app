import React, { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Camera, MapPin, Users, Globe, Image, Video, Mic, X, Loader2, Square, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { InlineVideoLoader } from '@/components/ui/VideoLoader';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUser } from '@/contexts/UserContext';
import { usePostMutations } from '@/hooks/usePostMutations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ImageCropper from '@/components/ImageCropper';
import MentionTextarea from '@/components/MentionTextarea';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { createPost, isCreating } = usePostMutations();
  const [postText, setPostText] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [locationText, setLocationText] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_PHOTOS = 10;

  // Preview & Edit state
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = [...selectedMedia, ...files].slice(0, MAX_PHOTOS);
    const previews = await Promise.all(
      newFiles.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      }))
    );
    setSelectedMedia(newFiles);
    setMediaPreviews(previews);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setSelectedMedia(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
    if (previewIndex === index) setPreviewIndex(null);
  };

  const handleCropComplete = useCallback((croppedBlob: Blob) => {
    if (editingIndex === null) return;
    const idx = editingIndex;

    // Replace the file
    const newFile = new File([croppedBlob], selectedMedia[idx].name, { type: 'image/jpeg' });
    setSelectedMedia(prev => prev.map((f, i) => i === idx ? newFile : f));

    // Replace the preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setMediaPreviews(prev => prev.map((p, i) => i === idx ? (reader.result as string) : p));
    };
    reader.readAsDataURL(croppedBlob);

    setEditingIndex(null);
  }, [editingIndex, selectedMedia]);

  const resolveLocation = async (pos: GeolocationPosition) => {
    const { latitude, longitude } = pos.coords;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`);
      const data = await res.json();
      const addr = data.address;
      const readable = [addr.road, addr.suburb || addr.neighbourhood, addr.city || addr.town || addr.village, addr.country].filter(Boolean).join(', ');
      setLocationText(readable || data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      setLocationText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }
    setLoadingLocation(false);
  };

  const handleLocationError = (error: GeolocationPositionError) => {
    let msg = 'Unable to get location';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        msg = 'Location permission denied. Please enable location access in your browser/phone settings and try again.';
        break;
      case error.POSITION_UNAVAILABLE:
        msg = 'Location unavailable. Please check that GPS/Location Services are turned on.';
        break;
      case error.TIMEOUT:
        msg = 'Location request timed out. Retrying...';
        break;
    }
    return { msg, isTimeout: error.code === error.TIMEOUT };
  };

  const handleAddLocation = () => {
    if (locationText) {
      setLocationText(null);
      return;
    }
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      resolveLocation,
      (error) => {
        const { msg, isTimeout } = handleLocationError(error);
        if (isTimeout) {
          // Fallback: retry with low accuracy and longer timeout
          toast.info(msg);
          navigator.geolocation.getCurrentPosition(
            resolveLocation,
            (retryError) => {
              const { msg: retryMsg } = handleLocationError(retryError);
              toast.error(retryMsg);
              setLoadingLocation(false);
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
          );
        } else {
          toast.error(msg);
          setLoadingLocation(false);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setVoiceBlob(blob);
      };

      mediaRecorder.start();
      setRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 29) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setRecordingTime(0);
  };

  const handlePost = async () => {
    if (!user) { navigate('/login'); return; }

    try {
      let voiceUrl: string | undefined;
      if (voiceBlob) {
        const file = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        const path = `${user.id}/${Date.now()}_voice.webm`;
        const { error } = await supabase.storage.from('post-media').upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from('post-media').getPublicUrl(path);
        voiceUrl = data.publicUrl;
      }

      await createPost(
        {
          content: postText,
          media: selectedMedia.length > 0 ? selectedMedia : undefined,
          locationText: locationText || undefined,
          voiceUrl,
        },
        user.id
      );
      navigate('/');
    } catch (error) {
      console.error('Failed to create post:', error);
    }
  };

  const privacyOptions = [
    { value: 'public', label: 'Public', icon: Globe },
    { value: 'friends', label: 'Friends', icon: Users },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => navigate('/')} className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-lg font-semibold">Create Post</h1>
          <Button onClick={handlePost} disabled={!postText.trim() || isCreating} className="px-6">
            {isCreating ? <span className="flex items-center gap-2"><InlineVideoLoader />Posting...</span> : 'Post'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* User Info */}
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-primary text-primary-foreground">{user?.initials || 'U'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user?.name || 'Your Name'}</p>
            <div className="flex items-center space-x-2">
              {privacyOptions.map((option) => {
                const IconComponent = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setPrivacy(option.value as 'public' | 'friends')}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition-colors ${
                      privacy === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <IconComponent className="w-3 h-3" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Post Content */}
        <MentionTextarea
          placeholder="What's on your mind?"
          value={postText}
          onChange={setPostText}
          className="w-full min-h-[120px] border-none p-0 text-lg resize-none outline-none bg-transparent placeholder:text-muted-foreground"
          dir="auto"
          rows={4}
        />

        {/* Location badge */}
        {locationText && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-xl border border-primary/20">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm text-primary font-medium truncate">📍 {locationText}</span>
            <button onClick={() => setLocationText(null)} className="ml-auto p-1 hover:bg-primary/20 rounded-full">
              <X className="w-3 h-3 text-primary" />
            </button>
          </div>
        )}

        {/* Voice recording preview */}
        {voiceBlob && !recording && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-xl border border-primary/20">
            <Mic className="w-4 h-4 text-primary shrink-0" />
            <audio controls src={URL.createObjectURL(voiceBlob)} className="h-8 flex-1" preload="metadata" />
            <button onClick={() => setVoiceBlob(null)} className="p-1 hover:bg-primary/20 rounded-full">
              <X className="w-3 h-3 text-primary" />
            </button>
          </div>
        )}

        {/* Active recording UI */}
        {recording && (
          <div className="flex items-center gap-3 px-4 py-3 bg-destructive/10 rounded-xl border border-destructive/20">
            <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive">Recording... {recordingTime}s / 30s</span>
            <button onClick={stopRecording} className="ml-auto p-2 bg-destructive text-white rounded-full hover:bg-destructive/90">
              <Square className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Media Thumbnails */}
        {mediaPreviews.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {mediaPreviews.map((preview, index) => (
                <div
                  key={index}
                  className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden group cursor-pointer border-2 border-transparent hover:border-primary/40 transition-all"
                  onClick={() => setPreviewIndex(index)}
                >
                  <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                  {/* Edit badge */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-1.5">
                      <Pencil className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                    className="absolute -top-1 -right-1 p-1 bg-black/70 rounded-full text-white hover:bg-black/90 transition-colors z-10"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {/* Index badge */}
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{selectedMedia.length}/{MAX_PHOTOS} photos • Tap to preview & edit</p>
          </div>
        )}

        {/* Media Options */}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleMediaSelect} className="hidden" />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group">
            <div className="text-center">
              <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">Add Photo</span>
            </div>
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors group">
            <div className="text-center">
              <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">Add Video</span>
            </div>
          </button>
        </div>

        {/* Additional Options */}
        <div className="space-y-3">
          <button onClick={handleAddLocation} className="w-full flex items-center p-3 rounded-lg hover:bg-muted/50 transition-colors">
            {loadingLocation ? (
              <Loader2 className="w-5 h-5 text-primary mr-3 animate-spin" />
            ) : (
              <MapPin className={`w-5 h-5 mr-3 ${locationText ? 'text-primary' : 'text-muted-foreground'}`} />
            )}
            <span className={locationText ? 'text-primary font-medium' : 'text-muted-foreground'}>
              {locationText ? 'Remove location' : 'Add location'}
            </span>
          </button>
          
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={!!voiceBlob && !recording}
            className="w-full flex items-center p-3 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Mic className={`w-5 h-5 mr-3 ${recording ? 'text-destructive' : voiceBlob ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={recording ? 'text-destructive font-medium' : voiceBlob ? 'text-primary font-medium' : 'text-muted-foreground'}>
              {recording ? 'Stop recording' : voiceBlob ? 'Voice note attached' : 'Record voice note'}
            </span>
          </button>
        </div>
      </div>

      {/* ── Full-screen Image Preview Modal ── */}
      {previewIndex !== null && mediaPreviews[previewIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
          onClick={() => setPreviewIndex(null)}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewIndex(null)}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
            >
              <X className="h-5 w-5 text-white" />
            </button>
            <span className="text-white/70 text-sm font-medium">
              {previewIndex + 1} / {mediaPreviews.length}
            </span>
            <button
              onClick={() => {
                setEditingIndex(previewIndex);
                setPreviewIndex(null);
              }}
              className="h-10 px-4 rounded-full bg-secondary hover:bg-secondary/90 flex items-center gap-2 transition-all shadow-lg shadow-secondary/30"
            >
              <Pencil className="h-4 w-4 text-secondary-foreground" />
              <span className="text-sm font-semibold text-secondary-foreground">Edit</span>
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center min-h-0 relative px-4" onClick={(e) => e.stopPropagation()}>
            {/* Prev arrow */}
            {previewIndex > 0 && (
              <button
                onClick={() => setPreviewIndex(previewIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all z-10"
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
            )}

            <img
              src={mediaPreviews[previewIndex]}
              alt={`Photo ${previewIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg"
            />

            {/* Next arrow */}
            {previewIndex < mediaPreviews.length - 1 && (
              <button
                onClick={() => setPreviewIndex(previewIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all z-10"
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-center gap-4 px-4 py-4 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                removePhoto(previewIndex);
                setPreviewIndex(null);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-destructive/20 hover:bg-destructive/30 text-destructive transition-all"
            >
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Remove</span>
            </button>
            <button
              onClick={() => {
                setEditingIndex(previewIndex);
                setPreviewIndex(null);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary/20 hover:bg-secondary/30 text-secondary transition-all"
            >
              <Pencil className="h-4 w-4" />
              <span className="text-sm font-medium">Edit & Crop</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Image Cropper/Editor ── */}
      {editingIndex !== null && mediaPreviews[editingIndex] && (
        <ImageCropper
          imageSrc={mediaPreviews[editingIndex]}
          aspectRatio={undefined}
          onCropComplete={handleCropComplete}
          onCancel={() => setEditingIndex(null)}
          cropShape="rect"
          dimensionLabel="Free crop"
        />
      )}
    </div>
  );
};

export default CreatePost;
