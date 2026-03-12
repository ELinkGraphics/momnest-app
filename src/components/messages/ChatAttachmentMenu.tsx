import React, { useRef, useState } from 'react';
import { Paperclip, Camera, Image, Video, Mic, MapPin, X, Loader2 } from 'lucide-react';
import { setFilePickerActive } from '@/utils/cacheManager';
import InlineCamera from './InlineCamera';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ChatAttachmentMenuProps {
  conversationId: string;
  senderId: string;
  onSendAttachment: (type: string, url: string, label: string) => void;
}

const ChatAttachmentMenu: React.FC<ChatAttachmentMenuProps> = ({
  conversationId,
  senderId,
  onSendAttachment,
}) => {
  const [open, setOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const ext = file.name.split('.').pop();
    const path = `${conversationId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const guardedClick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    setFilePickerActive(true);
    ref.current.click();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilePickerActive(false);
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setOpen(false);
    try {
      const url = await uploadFile(file, 'photos');
      onSendAttachment('photo', url, '📷 Photo');
    } catch (err) {
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    }
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilePickerActive(false);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video must be under 50MB');
      return;
    }
    setUploading(true);
    setOpen(false);
    try {
      const url = await uploadFile(file, 'videos');
      onSendAttachment('video', url, '🎥 Video');
    } catch (err) {
      toast.error('Failed to upload video');
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
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

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
          const url = await uploadFile(file, 'voice');
          onSendAttachment('voice', url, '🎤 Voice message');
        } catch (err) {
          toast.error('Failed to upload voice message');
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setOpen(false);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 29) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
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

  const handleShareLocation = () => {
    setOpen(false);
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const locationText = `📍 Location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        onSendAttachment('location', mapsUrl, locationText);
      },
      () => toast.error('Unable to get location'),
      { enableHighAccuracy: true }
    );
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 rounded-full animate-pulse">
          <div className="w-2 h-2 rounded-full bg-destructive" />
          <span className="text-xs font-medium text-destructive">{recordingTime}s / 30s</span>
        </div>
        <button
          onClick={stopRecording}
          className="p-2 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="p-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-muted/50 transition-colors shrink-0"
      >
        <Paperclip className="h-5 w-5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 bg-background border border-border rounded-2xl shadow-lg p-2 flex gap-1 animate-fade-in z-50">
          <button onClick={() => setShowCamera(true)} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <Camera className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground">Camera</span>
          </button>
          <button onClick={() => guardedClick(fileInputRef)} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <Image className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground">Photo</span>
          </button>
          <button onClick={() => guardedClick(videoInputRef)} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <Video className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground">Video</span>
          </button>
          <button onClick={startRecording} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <Mic className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground">Voice</span>
          </button>
          <button onClick={handleShareLocation} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground">Location</span>
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
      <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />

      {showCamera && (
        <InlineCamera
          onCapture={async (blob: Blob) => {
            setShowCamera(false);
            setUploading(true);
            try {
              const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
              const url = await uploadFile(file, 'photos');
              onSendAttachment('photo', url, '📷 Photo');
            } catch (err) {
              toast.error('Failed to upload photo');
            } finally {
              setUploading(false);
            }
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
};

export default ChatAttachmentMenu;
