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
import MentionTextarea from '@/components/MentionTextarea';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { createPost, isCreating } = usePostMutations();
  const [postText, setPostText] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const fileManager = useFileManager();
  const [locationText, setLocationText] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);



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

      let coverImage: File | undefined;
      const firstVideo = fileManager.files.find(item => item.kind === 'video');
      
      if (firstVideo) {
        try {
          const { generateVideoThumbnail } = await import('@/lib/videoUtils');
          const thumb = await generateVideoThumbnail(firstVideo.file as File);
          coverImage = new File([thumb.blob], `thumb_${firstVideo.name}.jpg`, { type: 'image/jpeg' });
        } catch (err) {
          console.error('Thumbnail generation failed', err);
        }
      }

      await createPost(
        {
          content: postText,
          media: fileManager.files.map(item => item.file as File),
          locationText: locationText || undefined,
          voiceUrl,
          coverImage,
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

        {/* Custom File Picker Component */}
        <CustomFilePicker 
          manager={fileManager} 
          hideUploadButton 
          accept="image/*,video/*"
        />

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

    </div>
  );
};

export default CreatePost;
