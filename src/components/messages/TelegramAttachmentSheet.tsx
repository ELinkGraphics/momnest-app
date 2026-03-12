import React, { useRef, useState } from 'react';
import { Image, Camera, Video, FileText, MapPin, User, X } from 'lucide-react';
import { InlineVideoLoader } from '@/components/ui/VideoLoader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TelegramAttachmentSheetProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  senderId: string;
  onSendAttachment: (type: string, url: string, label: string) => void;
  onMediaSelected: (files: File[], type: 'photo' | 'video') => void;
}

const TelegramAttachmentSheet: React.FC<TelegramAttachmentSheetProps> = ({
  open,
  onClose,
  conversationId,
  senderId,
  onSendAttachment,
  onMediaSelected,
}) => {
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onClose();
      onMediaSelected(files, 'photo');
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onClose();
      onMediaSelected(files, 'photo');
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (files.some(f => f.size > 50 * 1024 * 1024)) {
        toast.error('Video must be under 50MB');
        return;
      }
      onClose();
      onMediaSelected(files, 'video');
    }
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onClose();
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${conversationId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('post-media').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('post-media').getPublicUrl(path);
      onSendAttachment('file', data.publicUrl, `📎 ${file.name}`);
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleShareLocation = () => {
    onClose();
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

  const handleShareContact = () => {
    onClose();
    toast.info('Contact sharing coming soon');
  };

  if (!open) return null;

  const options = [
    { icon: Image, label: 'Photo', color: 'bg-blue-500', onClick: () => photoInputRef.current?.click() },
    { icon: Camera, label: 'Camera', color: 'bg-orange-500', onClick: () => cameraInputRef.current?.click() },
    { icon: Video, label: 'Video', color: 'bg-red-500', onClick: () => videoInputRef.current?.click() },
    { icon: FileText, label: 'File', color: 'bg-violet-500', onClick: () => fileInputRef.current?.click() },
    { icon: MapPin, label: 'Location', color: 'bg-green-500', onClick: handleShareLocation },
    { icon: User, label: 'Contact', color: 'bg-cyan-500', onClick: handleShareContact },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="bg-background rounded-t-3xl shadow-2xl border-t border-border/50 safe-bottom">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-3 px-6 pb-6 pt-2">
            {options.map(({ icon: Icon, label, color, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-center gap-2.5 p-4 rounded-2xl hover:bg-muted/60 active:scale-95 transition-all"
              >
                <div className={`${color} w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-xs font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 pb-4 text-sm text-muted-foreground">
              <InlineVideoLoader />
              Uploading...
            </div>
          )}
        </div>
      </div>

      {/* Hidden inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" />
      <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
      <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
    </>
  );
};

export default TelegramAttachmentSheet;
