import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Camera, Image, Video, Mic, MapPin, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';
import { useUpdateMessage } from '@/hooks/useMessages';

interface ChatAttachmentMenuProps {
  conversationId: string;
  senderId: string;
  onSendAttachment: (type: string, url: string, label: string, id?: string) => void;
}

const ChatAttachmentMenu: React.FC<ChatAttachmentMenuProps> = ({
  conversationId,
  senderId,
  onSendAttachment,
}) => {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const { mutate: updateMessage } = useUpdateMessage();
  
  const photoManager = useFileManager();
  const videoManager = useFileManager();
  const cameraManager = useFileManager();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadFile = async (file: File | Blob, folder: string): Promise<string> => {
    const ext = folder === 'voice' ? 'webm' : (file as File).name?.split('.').pop() || 'tmp';
    const path = `${conversationId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    return data.publicUrl;
  };

  // Photo processing
  useEffect(() => {
    const item = photoManager.files[0];
    if (item) {
      const process = async () => {
        setOpen(false);
        const localUrl = item.url;
        const messageId = crypto.randomUUID();

        // Optimistic send
        onSendAttachment('photo', localUrl, '📷 Photo', messageId);

        try {
          const url = await uploadFile(item.file, 'photos');
          updateMessage({ messageId, attachmentUrl: url });
        } catch (error) {
          console.error('[Upload] Photo failed:', error);
          toast.error('Failed to upload photo');
        } finally {
          photoManager.clearAll();
        }
      };
      process();
    }
  }, [photoManager.files, onSendAttachment, updateMessage]);

  // Video processing
  useEffect(() => {
    const item = videoManager.files[0];
    if (item) {
      const process = async () => {
        setOpen(false);
        const localUrl = item.url;
        const messageId = crypto.randomUUID();

        // Optimistic send
        onSendAttachment('video', localUrl, '🎥 Video', messageId);

        try {
          const url = await uploadFile(item.file, 'videos');
          updateMessage({ messageId, attachmentUrl: url });
        } catch (error) {
          console.error('[Upload] Video failed:', error);
          toast.error('Failed to upload video');
        } finally {
          videoManager.clearAll();
        }
      };
      process();
    }
  }, [videoManager.files, onSendAttachment, updateMessage]);

  // Camera processing
  useEffect(() => {
    const item = cameraManager.files[0];
    if (item) {
      const process = async () => {
        setOpen(false);
        const localUrl = item.url;
        const messageId = crypto.randomUUID();

        // Optimistic send
        onSendAttachment('photo', localUrl, '📷 Photo', messageId);

        try {
          const url = await uploadFile(item.file, 'photos');
          updateMessage({ messageId, attachmentUrl: url });
        } catch (error) {
          console.error('[Upload] Camera failed:', error);
          toast.error('Failed to upload photo');
        } finally {
          cameraManager.clearAll();
        }
      };
      process();
    }
  }, [cameraManager.files, onSendAttachment, updateMessage]);

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
        
        // Optimistic Voice
        const localUrl = URL.createObjectURL(blob);
        const messageId = crypto.randomUUID();
        onSendAttachment('voice', localUrl, '🎤 Voice message', messageId);

        try {
          const url = await uploadFile(blob, 'voice');
          updateMessage({ messageId, attachmentUrl: url });
        } catch (err) {
          console.error('[Upload] Voice failed:', err);
          toast.error('Failed to upload voice message');
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
        const locationText = `📍 My location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
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
          <CustomFilePicker manager={cameraManager} hideUploadButton hidePreviewList accept="image/*" useCameraImmediate>
            <button 
              onClick={() => setOpen(false)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors w-full"
            >
              <Camera className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Camera</span>
            </button>
          </CustomFilePicker>
          <CustomFilePicker manager={photoManager} hideUploadButton hidePreviewList accept="image/*">
            <button 
              onClick={() => setOpen(false)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors w-full"
            >
              <Image className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Photo</span>
            </button>
          </CustomFilePicker>
          <CustomFilePicker manager={videoManager} hideUploadButton hidePreviewList accept="video/*">
            <button 
              onClick={() => setOpen(false)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-muted/50 transition-colors w-full"
            >
              <Video className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">Video</span>
            </button>
          </CustomFilePicker>
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
    </div>
  );
};

export default ChatAttachmentMenu;
