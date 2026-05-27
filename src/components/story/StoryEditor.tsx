import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import StoryTextOverlay, { TextOverlay } from './StoryTextOverlay';
import StoryStickerPicker, { StickerItem } from './StoryStickerPicker';
import StoryFilterPicker, { STORY_FILTERS } from './StoryFilterPicker';
import { EditorToolbar } from './EditorToolbar';
import { useStoryExport, ImageSticker, EditorExtraData } from '@/hooks/useStoryExport';
import { useEditorGestures } from '@/hooks/useEditorGestures';

interface InitialPostElement {
  postCardImageUrl?: string;
}

interface Props {
  previewUrl: string;
  mediaType?: 'image' | 'video';
  initialPostElements?: InitialPostElement;
  resharedPostId?: string;
  onDone: (editedImageBlob: Blob, mentionedUserIds?: string[], extraData?: EditorExtraData) => void;
  onCancel: () => void;
}

const CANVAS_W = 390;
const CANVAS_H = 844;
const TRASH_ZONE_H = 80;

// Safe-frame margin (px inside the canvas) — visible boundary
const SAFE_MARGIN_X = 12;
const SAFE_MARGIN_Y = 12;
const SAFE_W = CANVAS_W - SAFE_MARGIN_X * 2;
const SAFE_H = CANVAS_H - SAFE_MARGIN_Y * 2;
const ADDED_IMG_MAX = 150;

const StoryEditor: React.FC<Props> = ({ previewUrl, mediaType = 'image', initialPostElements, resharedPostId, onDone, onCancel }) => {
  const isInitialVideo = mediaType === 'video';

  const buildInitialImageStickers = (): ImageSticker[] => {
    const stickers: ImageSticker[] = [
      { id: `img-initial-${Date.now()}`, src: previewUrl, x: CANVAS_W / 2, y: CANVAS_H / 2, scale: 1, rotation: 0, isVideo: isInitialVideo },
    ];
    if (initialPostElements?.postCardImageUrl) {
      stickers.push({
        id: `img-postcard-${Date.now()}`,
        src: initialPostElements.postCardImageUrl,
        x: CANVAS_W / 2,
        y: CANVAS_H / 2,
        scale: 1,
        rotation: 0,
        isVideo: false,
      });
    }
    return stickers;
  };

  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [emojiStickers, setEmojiStickers] = useState<StickerItem[]>([]);
  const [imageStickers, setImageStickers] = useState<ImageSticker[]>(buildInitialImageStickers);
  const [initialMediaRatio, setInitialMediaRatio] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [activeTool, setActiveTool] = useState<'text' | 'sticker' | 'filter' | null>(null);

  const imageStickersRef = useRef(imageStickers);
  const textOverlaysRef = useRef(textOverlays);
  const emojiStickersRef = useRef(emojiStickers);
  useEffect(() => { imageStickersRef.current = imageStickers; }, [imageStickers]);
  useEffect(() => { textOverlaysRef.current = textOverlays; }, [textOverlays]);
  useEffect(() => { emojiStickersRef.current = emojiStickers; }, [emojiStickers]);

  const adjustInitialSticker = (mediaW: number, mediaH: number) => {
    // Calculate scale so the media fits within the safe zone of the canvas
    const scaleX = SAFE_W / mediaW;
    const scaleY = SAFE_H / mediaH;
    const fitScale = Math.min(scaleX, scaleY, 1); // never upscale beyond 1

    setImageStickers(prev => prev.map(s => {
      if (s.id.startsWith('img-initial-')) {
        return { ...s, scale: fitScale };
      }
      return s;
    }));
  };

  useEffect(() => {
    if (isInitialVideo) {
      const v = document.createElement('video');
      v.src = previewUrl;
      v.onloadedmetadata = () => {
        const ratio = v.videoWidth / v.videoHeight;
        setInitialMediaRatio(ratio);
        adjustInitialSticker(v.videoWidth, v.videoHeight);
      };
    } else {
      const img = new Image();
      img.src = previewUrl;
      img.onload = () => {
        const ratio = img.width / img.height;
        setInitialMediaRatio(ratio);
        adjustInitialSticker(img.width, img.height);
      };
    }
  }, [previewUrl, isInitialVideo]);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const getRect = () => canvasRef.current?.getBoundingClientRect();

  const toCanvas = useCallback((cx: number, cy: number) => {
    const r = getRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((cx - r.left) / r.width) * CANVAS_W, y: ((cy - r.top) / r.height) * CANVAS_H };
  }, []);

  const isOverTrash = useCallback((clientY: number) => {
    const r = getRect();
    if (!r) return false;
    return clientY > r.bottom - (TRASH_ZONE_H * r.height / CANVAS_H);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => { e.preventDefault(); };
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('touchend', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
      el.removeEventListener('touchend', prevent);
    };
  }, []);

  const {
    onImageDown,
    onImageMove,
    onImageUp,
    onOverlayDown,
    onGlobalPointerMove,
    onGlobalPointerUp,
  } = useEditorGestures({
    imageStickersRef,
    textOverlaysRef,
    emojiStickersRef,
    setImageStickers,
    setTextOverlays,
    setEmojiStickers,
    setSelectedImageId,
    setShowTrash,
    setDeletingId,
    setSnapV,
    setSnapH,
    setOverTrash,
    toCanvas,
    isOverTrash,
  });

  const filterCss = STORY_FILTERS.find(f => f.id === selectedFilter)?.css || 'none';

  const { handleExport } = useStoryExport({
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    safeW: SAFE_W,
    safeH: SAFE_H,
    addedImgMax: ADDED_IMG_MAX,
    initialMediaRatio,
    imageStickers,
    textOverlays,
    emojiStickers,
    deletingId,
    videoRefs,
    isInitialVideo,
    previewUrl,
    filterCss,
    onDone,
  });

  const handleAddImageSticker = (file: File | Blob) => {
    const url = URL.createObjectURL(file);
    const isVid = file.type.startsWith('video/');
    setImageStickers(prev => [...prev, { id: `img-${Date.now()}`, src: url, x: CANVAS_W / 2, y: CANVAS_H / 2, scale: 1, rotation: 0, isVideo: isVid }]);
  };

  const handleAddText = (overlay: TextOverlay) => setTextOverlays(prev => [...prev, overlay]);
  const handleAddSticker = (sticker: StickerItem) => {
    const offsetX = Math.random() * 10 - 5; // -5% to +5%
    const offsetY = Math.random() * 10 - 5;
    setEmojiStickers(prev => [...prev, { ...sticker, x: sticker.x + offsetX, y: sticker.y + offsetY }]);
  };
  const handleRemoveOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(t => t.id !== id));
    setEmojiStickers(prev => prev.filter(s => s.id !== id));
    setImageStickers(prev => prev.filter(s => s.id !== id));
  };

  const isPortrait916 = initialMediaRatio && Math.abs(initialMediaRatio - (CANVAS_W / CANVAS_H)) < 0.05;

  return (
    <div
      className="fixed inset-0 z-[110] bg-black flex flex-col items-center"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerMove={onGlobalPointerMove}
      onPointerUp={onGlobalPointerUp}
      onPointerCancel={onGlobalPointerUp}
    >
      <EditorToolbar
        onCancel={onCancel}
        onAddImageSticker={handleAddImageSticker}
        onToolSelect={setActiveTool}
        onExport={handleExport}
      />

      {/* Editor Canvas Container */}
      <div className="flex-1 w-full max-w-[390px] relative overflow-hidden flex items-center justify-center pointer-events-none">
        
        {/* Aspect Ratio Forced Canvas */}
        <div
          ref={canvasRef}
          className="relative pointer-events-auto bg-black"
          style={{
            width: '100%',
            maxWidth: '390px',
            aspectRatio: '9/16',
            maxHeight: '100%',
            overflow: 'hidden',
            borderRadius: '16px'
          }}
        >
          {/* Blurred Background Logic */}
          {!isPortrait916 && (
            <div className="absolute inset-0 pointer-events-none -z-10">
              {(() => {
                const initS = imageStickers.find(s => s.id.startsWith('img-initial-'));
                if (!initS) return null;
                return initS.isVideo ? (
                  <video
                    src={initS.src}
                    className="w-full h-full object-cover"
                    style={{ filter: 'blur(40px) brightness(0.7)', transform: 'scale(1.15)' }}
                    autoPlay loop muted playsInline
                  />
                ) : (
                  <img
                    src={initS.src}
                    className="w-full h-full object-cover"
                    style={{ filter: 'blur(40px) brightness(0.7)', transform: 'scale(1.15)' }}
                    alt=""
                  />
                );
              })()}
              <div className="absolute inset-0 bg-black/30" />
            </div>
          )}

          {/* Standard Gradient Background (only for 9:16) */}
          {isPortrait916 && (
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary opacity-30 pointer-events-none" />
          )}

          {/* Canvas content area */}
          <div className="absolute inset-0" style={{ filter: filterCss }}>
            {imageStickers.map(s => (
              <div
                key={s.id}
                className="absolute origin-center"
                style={{
                  left: `${(s.x / CANVAS_W) * 100}%`,
                  top: `${(s.y / CANVAS_H) * 100}%`,
                  transform: `translate(-50%, -50%) scale(${s.scale}) rotate(${s.rotation}deg)`,
                  zIndex: s.id.startsWith('img-initial-') ? 0 : 10,
                  opacity: s.id === deletingId ? 0.5 : 1,
                  transition: s.id === deletingId ? 'opacity 0.2s' : 'none',
                  filter: s.id.startsWith('img-initial-') && !isPortrait916
                    ? 'drop-shadow(0px 10px 40px rgba(0,0,0,0.4))'
                    : 'none'
                }}
                onPointerDown={(e) => onImageDown(e, s.id)}
                onPointerMove={onImageMove}
                onPointerUp={onImageUp}
                onPointerCancel={onImageUp}
              >
                {s.isVideo ? (
                  <video
                    ref={(el) => { if (el) videoRefs.current.set(s.id, el); else videoRefs.current.delete(s.id); }}
                    src={s.src}
                    className={`max-w-none max-h-none pointer-events-none ${s.id === selectedImageId && !s.id.startsWith('img-initial-') ? 'ring-2 ring-white/50' : ''}`}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={s.src}
                    alt=""
                    draggable={false}
                    className={`max-w-none max-h-none pointer-events-none select-none ${s.id === selectedImageId && !s.id.startsWith('img-initial-') ? 'ring-2 ring-white/50' : ''}`}
                  />
                )}
              </div>
            ))}

            {textOverlays.map(t => (
              <div
                key={t.id}
                className="absolute origin-center px-4 py-2 cursor-move"
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  opacity: t.id === deletingId ? 0.5 : 1,
                  transition: t.id === deletingId ? 'opacity 0.2s' : 'none',
                  fontFamily: 'sans-serif',
                  fontWeight: t.fontWeight,
                  fontStyle: t.fontStyle,
                  fontSize: `${(t.fontSize / CANVAS_W) * 100}cqw`,
                  color: t.color,
                  backgroundColor: t.bgColor,
                  textAlign: t.textAlign,
                  borderRadius: '8px',
                  whiteSpace: 'nowrap',
                }}
                onPointerDown={(e) => onOverlayDown(e, t.id)}
                onClick={() => {
                  const nt = prompt('Edit text:', t.text);
                  if (nt !== null) {
                    setTextOverlays(prev => prev.map(o => o.id === t.id ? { ...o, text: nt } : o));
                  }
                }}
              >
                {t.text}
              </div>
            ))}

            {emojiStickers.map(s => (
              <div
                key={s.id}
                className="absolute origin-center cursor-move"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  opacity: s.id === deletingId ? 0.5 : 1,
                  transition: s.id === deletingId ? 'opacity 0.2s' : 'none',
                }}
                onPointerDown={(e) => onOverlayDown(e, s.id)}
              >
                {s.type === 'emoji' ? (
                  <span className="text-4xl filter drop-shadow-md">{s.content}</span>
                ) : (
                  <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-xl flex items-center gap-2">
                    <span className="text-white font-bold">{s.content}</span>
                  </div>
                )}
              </div>
            ))}

            {snapV && <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/50 -translate-x-1/2 z-50 pointer-events-none" />}
            {snapH && <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/50 -translate-y-1/2 z-50 pointer-events-none" />}
          </div>

          <div
            className={`absolute inset-4 border-2 border-white/30 border-dashed rounded-xl pointer-events-none transition-opacity duration-300 z-[100] ${
              showTrash ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      </div>

      <div
        className={`w-full max-w-[390px] h-[80px] flex items-center justify-center transition-all duration-300 ${
          showTrash ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none absolute bottom-0'
        }`}
      >
        <div className={`p-4 rounded-full transition-all duration-200 ${overTrash ? 'bg-red-500 scale-125' : 'bg-black/50'}`}>
          <Trash2 className={`size-6 ${overTrash ? 'text-white' : 'text-white/70'}`} />
        </div>
      </div>

      {activeTool === 'text' && (
        <StoryTextOverlay
          onAdd={handleAddText}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool === 'sticker' && (
        <StoryStickerPicker
          onSelect={handleAddSticker}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool === 'filter' && (
        <StoryFilterPicker
          selectedId={selectedFilter}
          onSelect={(id) => {
            setSelectedFilter(id);
            setActiveTool(null);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}
    </div>
  );
};

export default StoryEditor;
