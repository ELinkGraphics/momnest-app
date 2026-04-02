import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Type, Sticker, Sparkles, Image as ImageIcon, Trash2, MapPin, Hash, AtSign, Link2 } from 'lucide-react';
import StoryTextOverlay, { TextOverlay } from './StoryTextOverlay';
import StoryStickerPicker, { StickerItem } from './StoryStickerPicker';
import StoryFilterPicker, { STORY_FILTERS } from './StoryFilterPicker';
import { CustomFilePicker } from '@/components/CustomFilePicker';

interface EditorExtraData {
  originalVideoUrl?: string;
  mediaType: 'image' | 'video';
  overlayBlob?: Blob;
  videoTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    canvasW: number;
    canvasH: number;
  };
  backgroundGradient?: {
    from: string;
    to: string;
  };
  stickerData?: Array<{
    type: 'emoji' | 'info';
    content: string;
    infoType?: string;
    mentionUserId?: string;
    x: number;
    y: number;
  }>;
}

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

interface ImageSticker {
  id: string;
  src: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  isVideo?: boolean;
}

const CANVAS_W = 390;
const CANVAS_H = 844;
const SNAP_THRESHOLD = 8;
const TRASH_ZONE_H = 80;
const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

// Safe-frame margin (px inside the canvas) — visible boundary
const SAFE_MARGIN_X = 12;
const SAFE_MARGIN_Y = 12;
const SAFE_W = CANVAS_W - SAFE_MARGIN_X * 2;
const SAFE_H = CANVAS_H - SAFE_MARGIN_Y * 2;

// Initial sticker size — fill the safe frame
const ADDED_IMG_MAX = 150;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const angle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);

const StoryEditor: React.FC<Props> = ({ previewUrl, mediaType = 'image', initialPostElements, resharedPostId, onDone, onCancel }) => {
  const isInitialVideo = mediaType === 'video';

  // Build initial image stickers: background + optional post card
  const buildInitialImageStickers = (): ImageSticker[] => {
    const stickers: ImageSticker[] = [
      { id: `img-initial-${Date.now()}`, src: previewUrl, x: CANVAS_W / 2, y: CANVAS_H / 2, scale: 1, rotation: 0, isVideo: isInitialVideo },
    ];
    // Add post card as a draggable sticker if provided
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

  // Build initial text overlays (none for post card mode)
  const buildInitialTextOverlays = (): TextOverlay[] => {
    return [];
  };

  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>(buildInitialTextOverlays);
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

  // Detect initial media dimensions for better layout
  useEffect(() => {
    if (isInitialVideo) {
      const v = document.createElement('video');
      v.src = previewUrl;
      v.onloadedmetadata = () => {
        const ratio = v.videoWidth / v.videoHeight;
        setInitialMediaRatio(ratio);
        adjustInitialSticker(ratio);
      };
    } else {
      const img = new Image();
      img.src = previewUrl;
      img.onload = () => {
        const ratio = img.width / img.height;
        setInitialMediaRatio(ratio);
        adjustInitialSticker(ratio);
      };
    }
  }, [previewUrl]);

  const adjustInitialSticker = (ratio: number) => {
    // If not close to 9:16 (approx 0.56)
    const targetRatio = CANVAS_W / CANVAS_H;
    if (Math.abs(ratio - targetRatio) > 0.05) {
      setImageStickers(prev => prev.map(s => {
        if (s.id.startsWith('img-initial-')) {
          // Scale to FIT (contain)
          const scale = Math.min(SAFE_W / (CANVAS_W * ratio), SAFE_H / CANVAS_H);
          // Actually, just scale it so it fits nicely
          const fitScale = ratio > targetRatio 
            ? (CANVAS_W * 0.9) / CANVAS_W // Landscape: fit width
            : (CANVAS_H * 0.8) / CANVAS_H; // Portrait but not 9:16
          
          return { ...s, scale: fitScale };
        }
        return s;
      }));
    }
  };

  // Refs to video elements for frame capture during export
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const activeGesture = useRef<{
    type: 'image' | 'overlay';
    id: string;
    offsetX: number;
    offsetY: number;
    initDist: number;
    initAngle: number;
    initScale: number;
    initRotation: number;
    pid1: number;
    pid2: number;
  } | null>(null);

  const rafId = useRef<number>(0);
  const pendingMove = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const filterCss = STORY_FILTERS.find(f => f.id === selectedFilter)?.css || 'none';

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

  // Prevent default touch on canvas
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

  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      if (activeGesture.current) e.preventDefault();
    };
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => document.removeEventListener('touchmove', prevent);
  }, []);

  // Add image sticker
  const handleAddImageSticker = (file: File | Blob) => {
    const url = URL.createObjectURL(file);
    const isVid = file.type.startsWith('video/');
    setImageStickers(prev => [...prev, { id: `img-${Date.now()}`, src: url, x: CANVAS_W / 2, y: CANVAS_H / 2, scale: 1, rotation: 0, isVideo: isVid }]);
  };

  // ── IMAGE GESTURE HANDLERS ──
  const onImageDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    setSelectedImageId(id);
    setImageStickers(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1), prev[idx]];
    });
    setShowTrash(true);

    const img = imageStickersRef.current.find(s => s.id === id);
    if (!img) return;

    if (pointers.current.size === 1) {
      const pos = toCanvas(e.clientX, e.clientY);
      activeGesture.current = {
        type: 'image', id,
        offsetX: pos.x - img.x, offsetY: pos.y - img.y,
        initDist: 0, initAngle: 0, initScale: img.scale, initRotation: img.rotation,
        pid1: e.pointerId, pid2: -1,
      };
    } else if (pointers.current.size === 2) {
      const [p1, p2] = Array.from(pointers.current.entries());
      activeGesture.current = {
        type: 'image', id,
        offsetX: 0, offsetY: 0,
        initDist: dist(p1[1], p2[1]),
        initAngle: angle(p1[1], p2[1]),
        initScale: img.scale,
        initRotation: img.rotation,
        pid1: p1[0], pid2: p2[0],
      };
    }
  }, [toCanvas]);

  const onImageMove = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    if (!g || g.type !== 'image') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    pendingMove.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const gesture = activeGesture.current;
      if (!gesture || gesture.type !== 'image') return;
      const pm = pendingMove.current;
      if (!pm) return;

      if (pointers.current.size === 1) {
        const pos = toCanvas(pm.x, pm.y);
        const newX = pos.x - gesture.offsetX;
        const newY = pos.y - gesture.offsetY;
        setImageStickers(prev => prev.map(s => s.id === gesture.id ? { ...s, x: newX, y: newY } : s));
        const midX = CANVAS_W / 2, midY = CANVAS_H / 2;
        setSnapV(Math.abs(newX - midX) < SNAP_THRESHOLD);
        setSnapH(Math.abs(newY - midY) < SNAP_THRESHOLD);
        setOverTrash(isOverTrash(pm.y));
      } else if (pointers.current.size >= 2) {
        const p1 = pointers.current.get(gesture.pid1);
        const p2 = pointers.current.get(gesture.pid2);
        if (!p1 || !p2) return;
        const curDist = dist(p1, p2);
        const curAngle = angle(p1, p2);
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, gesture.initScale * (curDist / gesture.initDist)));
        const newRotation = gesture.initRotation + (curAngle - gesture.initAngle);
        const midClient = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const midCanvas = toCanvas(midClient.x, midClient.y);
        setImageStickers(prev => prev.map(s => s.id === gesture.id ? { ...s, scale: newScale, rotation: newRotation, x: midCanvas.x, y: midCanvas.y } : s));
        setSnapV(false);
        setSnapH(false);
      }
    });
  }, [toCanvas, isOverTrash]);

  const onImageUp = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    // Don't interfere with overlay gestures (emoji/text) — let them bubble to global handler
    if (g && g.type !== 'image') return;

    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 0) {
      if (g && g.type === 'image' && isOverTrash(e.clientY)) {
        setDeletingId(g.id);
        setTimeout(() => {
          setImageStickers(prev => prev.filter(s => s.id !== g.id));
          setDeletingId(null);
          setSelectedImageId(null);
        }, 200);
      }
      activeGesture.current = null;
      setSnapH(false); setSnapV(false);
      setOverTrash(false); setShowTrash(false);
    } else if (pointers.current.size === 1 && g) {
      const [remaining] = Array.from(pointers.current.entries());
      const img = imageStickersRef.current.find(s => s.id === g.id);
      if (img) {
        const pos = toCanvas(remaining[1].x, remaining[1].y);
        activeGesture.current = {
          ...g,
          offsetX: pos.x - img.x, offsetY: pos.y - img.y,
          pid1: remaining[0], pid2: -1,
          initDist: 0, initAngle: 0, initScale: img.scale, initRotation: img.rotation,
        };
      }
    }
  }, [toCanvas, isOverTrash]);

  // ── OVERLAY GESTURE HANDLERS ──
  const onOverlayDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const pos = toCanvas(e.clientX, e.clientY);
    const text = textOverlaysRef.current.find(t => t.id === id);
    const sticker = emojiStickersRef.current.find(s => s.id === id);
    const itemX = text ? (text.x / 100) * CANVAS_W : sticker ? (sticker.x / 100) * CANVAS_W : 0;
    const itemY = text ? (text.y / 100) * CANVAS_H : sticker ? (sticker.y / 100) * CANVAS_H : 0;

    activeGesture.current = {
      type: 'overlay', id,
      offsetX: pos.x - itemX, offsetY: pos.y - itemY,
      initDist: 0, initAngle: 0, initScale: 1, initRotation: 0,
      pid1: e.pointerId, pid2: -1,
    };
    setShowTrash(true);
  }, [toCanvas]);

  const onOverlayMove = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    if (!g || g.type !== 'overlay') return;

    if (rafId.current) cancelAnimationFrame(rafId.current);
    const cx = e.clientX, cy = e.clientY;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const gesture = activeGesture.current;
      if (!gesture || gesture.type !== 'overlay') return;

      const pos = toCanvas(cx, cy);
      const newX = Math.max(0, Math.min(100, ((pos.x - gesture.offsetX) / CANVAS_W) * 100));
      const newY = Math.max(0, Math.min(100, ((pos.y - gesture.offsetY) / CANVAS_H) * 100));

      setTextOverlays(prev => prev.map(t => t.id === gesture.id ? { ...t, x: newX, y: newY } : t));
      setEmojiStickers(prev => prev.map(s => s.id === gesture.id ? { ...s, x: newX, y: newY } : s));

      const absX = (newX / 100) * CANVAS_W, absY = (newY / 100) * CANVAS_H;
      setSnapV(Math.abs(absX - CANVAS_W / 2) < SNAP_THRESHOLD);
      setSnapH(Math.abs(absY - CANVAS_H / 2) < SNAP_THRESHOLD);
      setOverTrash(isOverTrash(cy));
    });
  }, [toCanvas, isOverTrash]);

  const onOverlayUp = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    if (!g || g.type !== 'overlay') return;

    if (isOverTrash(e.clientY)) {
      setDeletingId(g.id);
      setTimeout(() => {
        setTextOverlays(prev => prev.filter(t => t.id !== g.id));
        setEmojiStickers(prev => prev.filter(s => s.id !== g.id));
        setDeletingId(null);
      }, 200);
    }
    activeGesture.current = null;
    setSnapH(false); setSnapV(false);
    setOverTrash(false); setShowTrash(false);
  }, [isOverTrash]);

  const onGlobalPointerMove = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    if (!g) return;
    if (g.type === 'overlay') onOverlayMove(e);
  }, [onOverlayMove]);

  const onGlobalPointerUp = useCallback((e: React.PointerEvent) => {
    const g = activeGesture.current;
    if (!g) return;
    if (g.type === 'overlay') onOverlayUp(e);
  }, [onOverlayUp]);

  const handleAddText = (overlay: TextOverlay) => setTextOverlays(prev => [...prev, overlay]);
  const handleAddSticker = (sticker: StickerItem) => setEmojiStickers(prev => [...prev, sticker]);
  const handleRemoveOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(t => t.id !== id));
    setEmojiStickers(prev => prev.filter(s => s.id !== id));
    setImageStickers(prev => prev.filter(s => s.id !== id));
  };

  const getInfoIcon = (infoType?: string) => {
    switch (infoType) {
      case 'location': return <MapPin className="size-3" />;
      case 'hashtag': return <Hash className="size-3" />;
      case 'mention': return <AtSign className="size-3" />;
      case 'link': return <Link2 className="size-3" />;
      default: return null;
    }
  };

  // ── Export: captures current video frame for video stickers ──
  const handleExport = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_W * 2;
    canvas.height = CANVAS_H * 2;
    const scaleX = canvas.width / CANVAS_W;
    const scaleY = canvas.height / CANVAS_H;
    const isPortrait916 = initialMediaRatio && Math.abs(initialMediaRatio - (CANVAS_W / CANVAS_H)) < 0.05;

    if (!isPortrait916) {
      // Draw Blurred Background Layer
      const initialSticker = imageStickers.find(s => s.id.startsWith('img-initial-'));
      if (initialSticker) {
        let bgSource: HTMLImageElement | HTMLVideoElement;
        if (initialSticker.isVideo) {
          bgSource = videoRefs.current.get(initialSticker.id)!;
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = initialSticker.src;
          await new Promise((r) => img.onload = r);
          bgSource = img;
        }

        if (bgSource) {
          ctx.save();
          
          // 1. Draw blurred media (COVER)
          const sW = initialSticker.isVideo ? (bgSource as HTMLVideoElement).videoWidth : (bgSource as HTMLImageElement).width;
          const sH = initialSticker.isVideo ? (bgSource as HTMLVideoElement).videoHeight : (bgSource as HTMLImageElement).height;
          const coverScale = Math.max(canvas.width / sW, canvas.height / sH);
          const dW = sW * coverScale;
          const dH = sH * coverScale;

          // Simple canvas blur: draw at low res then scale up
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d')!;
          tempCanvas.width = 100;
          tempCanvas.height = 100 * (canvas.height / canvas.width);
          tempCtx.drawImage(bgSource, 0, 0, tempCanvas.width, tempCanvas.height);
          
          ctx.globalAlpha = 1.0;
          ctx.filter = 'blur(60px) brightness(0.7)'; // Modern browsers support this
          ctx.drawImage(tempCanvas, (canvas.width - dW) / 2, (canvas.height - dH) / 2, dW, dH);
          ctx.filter = 'none';
          
          // 2. Draw 30% black overlay
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.restore();
        }
      }
    } else {
      // Draw standard gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const rootStyles = getComputedStyle(document.documentElement);
      const primaryHSL = rootStyles.getPropertyValue('--primary').trim();
      const secondaryHSL = rootStyles.getPropertyValue('--secondary').trim();
      gradient.addColorStop(0, `hsl(${primaryHSL})`);
      gradient.addColorStop(1, `hsl(${secondaryHSL})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw image/video stickers
    for (const sticker of imageStickers) {
      if (sticker.id === deletingId) continue;

      let source: HTMLImageElement | HTMLVideoElement;

      if (sticker.isVideo) {
        // Grab the live video element for current frame
        const videoEl = videoRefs.current.get(sticker.id);
        if (!videoEl) continue;
        source = videoEl;
      } else {
        const stickerImg = new Image();
        stickerImg.crossOrigin = 'anonymous';
        stickerImg.src = sticker.src;
        try {
          await new Promise((resolve, reject) => { stickerImg.onload = resolve; stickerImg.onerror = reject; });
        } catch { continue; }
        source = stickerImg;
      }

      const srcW = sticker.isVideo ? (source as HTMLVideoElement).videoWidth || 400 : (source as HTMLImageElement).width;
      const srcH = sticker.isVideo ? (source as HTMLVideoElement).videoHeight || 700 : (source as HTMLImageElement).height;

      const isInitial = sticker.id.startsWith('img-initial-');
      const fitScale = isInitial
        ? Math.min(SAFE_W / srcW, SAFE_H / srcH, 1)
        : Math.min(ADDED_IMG_MAX / srcW, ADDED_IMG_MAX / srcH, 1);

      const drawW = srcW * sticker.scale * fitScale;
      const drawH = srcH * sticker.scale * fitScale;

      ctx.save();
      ctx.translate(sticker.x * scaleX, sticker.y * scaleY);
      ctx.rotate((sticker.rotation * Math.PI) / 180);

      // Add drop shadow for foreground media if it's the initial non-9:16 media
      if (isInitial && !isPortrait916) {
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 10;
      }

      ctx.drawImage(source, -drawW, -drawH, drawW * 2, drawH * 2);
      ctx.restore();
    }

    // Draw text overlays
    for (const overlay of textOverlays) {
      const x = (overlay.x / 100) * canvas.width;
      const y = (overlay.y / 100) * canvas.height;
      const scaledFontSize = (overlay.fontSize / 400) * canvas.width;
      ctx.font = `${overlay.fontStyle} ${overlay.fontWeight} ${scaledFontSize}px sans-serif`;
      ctx.textAlign = overlay.textAlign;
      ctx.textBaseline = 'middle';
      if (overlay.bgColor !== 'transparent') {
        const metrics = ctx.measureText(overlay.text);
        const pad = scaledFontSize * 0.3;
        ctx.fillStyle = overlay.bgColor;
        const bgX = overlay.textAlign === 'center' ? x - metrics.width / 2 - pad :
                     overlay.textAlign === 'right' ? x - metrics.width - pad : x - pad;
        ctx.beginPath();
        ctx.roundRect(bgX, y - scaledFontSize / 2 - pad, metrics.width + pad * 2, scaledFontSize + pad * 2, 8);
        ctx.fill();
      }
      ctx.fillStyle = overlay.color;
      ctx.fillText(overlay.text, x, y);
    }

    // Draw emoji stickers
    for (const sticker of emojiStickers) {
      const x = (sticker.x / 100) * canvas.width;
      const y = (sticker.y / 100) * canvas.height;
      if (sticker.type === 'emoji') {
        const size = canvas.width * 0.08;
        ctx.font = `${size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sticker.content, x, y);
      } else {
        const fontSize = canvas.width * 0.035;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const metrics = ctx.measureText(sticker.content);
        const pad = fontSize * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(x - metrics.width / 2 - pad, y - fontSize / 2 - pad, metrics.width + pad * 2, fontSize + pad * 2, fontSize * 0.3);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sticker.content, x, y);
      }
    }

    const mentionedUserIds = emojiStickers
      .filter(s => s.infoType === 'mention' && s.mentionUserId)
      .map(s => s.mentionUserId!);

    // Collect sticker data for storage (needed for clickable links etc.)
    const allStickerData = emojiStickers.map(s => ({
      type: s.type,
      content: s.content,
      infoType: s.infoType,
      mentionUserId: s.mentionUserId,
      x: s.x,
      y: s.y,
    }));

    // Capture gradient colors for reconstruction
    const rootStyles2 = getComputedStyle(document.documentElement);
    const gradFrom = rootStyles2.getPropertyValue('--primary').trim();
    const gradTo = rootStyles2.getPropertyValue('--secondary').trim();

    // Capture the initial video sticker's transform
    const initialVideoSticker = isInitialVideo
      ? imageStickers.find(s => s.id.startsWith('img-initial-'))
      : null;

    const extraData: EditorExtraData = {
      mediaType: isInitialVideo ? 'video' : 'image',
      originalVideoUrl: isInitialVideo ? previewUrl : undefined,
      stickerData: allStickerData.length > 0 ? allStickerData : undefined,
      videoTransform: initialVideoSticker ? {
        x: initialVideoSticker.x,
        y: initialVideoSticker.y,
        scale: initialVideoSticker.scale,
        rotation: initialVideoSticker.rotation,
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
      } : undefined,
      backgroundGradient: isInitialVideo ? { from: gradFrom, to: gradTo } : undefined,
    };

    // For video stories with overlays, generate a transparent PNG overlay
    const hasOverlays = imageStickers.filter(s => !s.id.startsWith('img-initial-')).length > 0
      || textOverlays.length > 0
      || emojiStickers.length > 0;

    if (isInitialVideo && hasOverlays) {
      // Create a transparent overlay canvas (only non-video elements)
      const overlayCanvas = document.createElement('canvas');
      const overlayCtx = overlayCanvas.getContext('2d');
      if (overlayCtx) {
        overlayCanvas.width = CANVAS_W * 2;
        overlayCanvas.height = CANVAS_H * 2;
        const oScaleX = overlayCanvas.width / CANVAS_W;
        const oScaleY = overlayCanvas.height / CANVAS_H;

        // Draw non-initial image stickers only
        for (const sticker of imageStickers) {
          if (sticker.id === deletingId || sticker.id.startsWith('img-initial-')) continue;
          if (sticker.isVideo) continue; // skip video stickers in overlay

          const stickerImg = new Image();
          stickerImg.crossOrigin = 'anonymous';
          stickerImg.src = sticker.src;
          try {
            await new Promise((resolve, reject) => { stickerImg.onload = resolve; stickerImg.onerror = reject; });
          } catch { continue; }

          const srcW = stickerImg.width;
          const srcH = stickerImg.height;
          const fitScale = Math.min(ADDED_IMG_MAX / srcW, ADDED_IMG_MAX / srcH, 1);
          const drawW = srcW * sticker.scale * fitScale;
          const drawH = srcH * sticker.scale * fitScale;

          overlayCtx.save();
          overlayCtx.translate(sticker.x * oScaleX, sticker.y * oScaleY);
          overlayCtx.rotate((sticker.rotation * Math.PI) / 180);
          overlayCtx.drawImage(stickerImg, -drawW, -drawH, drawW * 2, drawH * 2);
          overlayCtx.restore();
        }

        // Draw text overlays
        for (const overlay of textOverlays) {
          const x = (overlay.x / 100) * overlayCanvas.width;
          const y = (overlay.y / 100) * overlayCanvas.height;
          const scaledFontSize = (overlay.fontSize / 400) * overlayCanvas.width;
          overlayCtx.font = `${overlay.fontStyle} ${overlay.fontWeight} ${scaledFontSize}px sans-serif`;
          overlayCtx.textAlign = overlay.textAlign;
          overlayCtx.textBaseline = 'middle';
          if (overlay.bgColor !== 'transparent') {
            const metrics = overlayCtx.measureText(overlay.text);
            const pad = scaledFontSize * 0.3;
            overlayCtx.fillStyle = overlay.bgColor;
            const bgX = overlay.textAlign === 'center' ? x - metrics.width / 2 - pad :
                         overlay.textAlign === 'right' ? x - metrics.width - pad : x - pad;
            overlayCtx.beginPath();
            overlayCtx.roundRect(bgX, y - scaledFontSize / 2 - pad, metrics.width + pad * 2, scaledFontSize + pad * 2, 8);
            overlayCtx.fill();
          }
          overlayCtx.fillStyle = overlay.color;
          overlayCtx.fillText(overlay.text, x, y);
        }

        // Draw emoji stickers
        for (const sticker of emojiStickers) {
          const x = (sticker.x / 100) * overlayCanvas.width;
          const y = (sticker.y / 100) * overlayCanvas.height;
          if (sticker.type === 'emoji') {
            const size = overlayCanvas.width * 0.08;
            overlayCtx.font = `${size}px serif`;
            overlayCtx.textAlign = 'center';
            overlayCtx.textBaseline = 'middle';
            overlayCtx.fillText(sticker.content, x, y);
          } else {
            const fontSize = overlayCanvas.width * 0.035;
            overlayCtx.font = `bold ${fontSize}px sans-serif`;
            const metrics = overlayCtx.measureText(sticker.content);
            const pad = fontSize * 0.5;
            overlayCtx.fillStyle = 'rgba(0,0,0,0.6)';
            overlayCtx.beginPath();
            overlayCtx.roundRect(x - metrics.width / 2 - pad, y - fontSize / 2 - pad, metrics.width + pad * 2, fontSize + pad * 2, fontSize * 0.3);
            overlayCtx.fill();
            overlayCtx.fillStyle = '#FFFFFF';
            overlayCtx.textAlign = 'center';
            overlayCtx.textBaseline = 'middle';
            overlayCtx.fillText(sticker.content, x, y);
          }
        }

        // Export overlay as transparent PNG
        const overlayBlobPromise = new Promise<Blob | null>((resolve) => {
          overlayCanvas.toBlob((b) => resolve(b), 'image/png');
        });
        const overlayBlob = await overlayBlobPromise;
        if (overlayBlob) {
          extraData.overlayBlob = overlayBlob;
        }
      }
    }

    // Unique publish path for video stories: avoid exporting the full canvas snapshot
    // (cross-origin video frames can make canvas export fail and block Done).
    if (isInitialVideo) {
      const placeholderCanvas = document.createElement('canvas');
      placeholderCanvas.width = 2;
      placeholderCanvas.height = 2;
      const placeholderCtx = placeholderCanvas.getContext('2d');
      if (placeholderCtx) {
        const grad = placeholderCtx.createLinearGradient(0, 0, 2, 2);
        grad.addColorStop(0, `hsl(${rootStyles2.getPropertyValue('--primary').trim()})`);
        grad.addColorStop(1, `hsl(${rootStyles2.getPropertyValue('--secondary').trim()})`);
        placeholderCtx.fillStyle = grad;
        placeholderCtx.fillRect(0, 0, 2, 2);
      }

      const placeholderBlob = await new Promise<Blob>((resolve) => {
        placeholderCanvas.toBlob(
          (b) => resolve(b ?? new Blob(['video-story'], { type: 'image/jpeg' })),
          'image/jpeg',
          0.8
        );
      });

      onDone(placeholderBlob, mentionedUserIds.length > 0 ? mentionedUserIds : undefined, extraData);
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) onDone(blob, mentionedUserIds.length > 0 ? mentionedUserIds : undefined, extraData);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black flex flex-col items-center"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerMove={onGlobalPointerMove}
      onPointerUp={onGlobalPointerUp}
      onPointerCancel={onGlobalPointerUp}
    >
      {/* Top bar */}
      <div className="w-full max-w-[390px] flex items-center justify-between p-3 z-30 relative">
        <button onClick={onCancel} className="p-2 rounded-full bg-card/10 text-white touch-target">
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <CustomFilePicker
            manager={undefined}
            onUpload={async (file) => {
              handleAddImageSticker(file);
            }}
            accept="image/*,video/*"
            hidePreviewList
          >
            <button
              className="p-2.5 rounded-full bg-card/10 text-white hover:bg-card/20 transition-colors touch-target"
              title="Add image sticker"
            >
              <ImageIcon className="size-5" />
            </button>
          </CustomFilePicker>
          <button onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            className={`p-2.5 rounded-full transition-colors touch-target ${activeTool === 'text' ? 'bg-primary text-primary-foreground' : 'bg-card/10 text-white'}`}>
            <Type className="size-5" />
          </button>
          <button onClick={() => setActiveTool(activeTool === 'sticker' ? null : 'sticker')}
            className={`p-2.5 rounded-full transition-colors touch-target ${activeTool === 'sticker' ? 'bg-primary text-primary-foreground' : 'bg-card/10 text-white'}`}>
            <Sticker className="size-5" />
          </button>
          <button onClick={() => setActiveTool(activeTool === 'filter' ? null : 'filter')}
            className={`p-2.5 rounded-full transition-colors touch-target ${activeTool === 'filter' ? 'bg-primary text-primary-foreground' : 'bg-card/10 text-white'}`}>
            <Sparkles className="size-5" />
          </button>
        </div>
        <button onClick={handleExport}
          className="px-5 py-2 rounded-full bg-primary text-primary-foreground font-medium text-sm touch-target">
          Done
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasRef}
        className="relative overflow-hidden rounded-2xl bg-black select-none"
        style={{
          width: '100%',
          maxWidth: CANVAS_W,
          aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          overscrollBehavior: 'none',
        }}
        onPointerMove={onImageMove}
        onPointerUp={onImageUp}
        onPointerCancel={onImageUp}
      >
        {/* Blurred background for non-9:16 media */}
        {initialMediaRatio && Math.abs(initialMediaRatio - (CANVAS_W / CANVAS_H)) > 0.05 && (
          <div className="absolute inset-0 pointer-events-none">
            {isInitialVideo ? (
              <video
                src={previewUrl}
                className="w-full h-full object-cover"
                style={{ filter: 'blur(40px) brightness(0.7)', transform: 'scale(1.15)' }}
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={previewUrl}
                className="w-full h-full object-cover"
                style={{ filter: 'blur(40px) brightness(0.7)', transform: 'scale(1.15)' }}
                alt=""
              />
            )}
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )}

        {/* Gradient background fallback */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
            filter: filterCss,
            opacity: initialMediaRatio && Math.abs(initialMediaRatio - (CANVAS_W / CANVAS_H)) > 0.05 ? 0 : 1,
          }}
        />

        {/* Snap guide lines */}
        {snapV && (
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-yellow-400/80 z-40 pointer-events-none"
            style={{ boxShadow: '0 0 4px rgba(250,204,21,0.5)' }} />
        )}
        {snapH && (
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-yellow-400/80 z-40 pointer-events-none"
            style={{ boxShadow: '0 0 4px rgba(250,204,21,0.5)' }} />
        )}

        {/* Safe-frame margin boundary */}
        <div
          className="absolute z-30 pointer-events-none border-2 border-dashed border-white/30 rounded-lg"
          style={{
            left: `${(SAFE_MARGIN_X / CANVAS_W) * 100}%`,
            top: `${(SAFE_MARGIN_Y / CANVAS_H) * 100}%`,
            width: `${(SAFE_W / CANVAS_W) * 100}%`,
            height: `${(SAFE_H / CANVAS_H) * 100}%`,
          }}
        >
          {/* Corner marks */}
          <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-white/60 rounded-tl" />
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-white/60 rounded-tr" />
          <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-white/60 rounded-bl" />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-white/60 rounded-br" />
        </div>
        {imageStickers.map((sticker) => {
          const isInitial = sticker.id.startsWith('img-initial-');
          const maxDim = isInitial ? SAFE_W : ADDED_IMG_MAX;

          return (
            <div
              key={sticker.id}
              className={`absolute select-none ${deletingId === sticker.id ? 'opacity-0 scale-75' : 'opacity-100'}`}
              style={{
                left: `${(sticker.x / CANVAS_W) * 100}%`,
                top: `${(sticker.y / CANVAS_H) * 100}%`,
                transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
                zIndex: selectedImageId === sticker.id ? 20 : 10,
                touchAction: 'none',
                willChange: 'transform',
                transition: deletingId === sticker.id ? 'opacity 0.2s, transform 0.2s' : 'none',
              }}
              onPointerDown={(e) => onImageDown(e, sticker.id)}
            >
              {sticker.isVideo ? (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(sticker.id, el);
                    else videoRefs.current.delete(sticker.id);
                  }}
                  src={sticker.src}
                  className="rounded-lg pointer-events-none object-cover"
                  style={{ maxWidth: `${maxDim}px`, maxHeight: `${maxDim}px` }}
                  autoPlay
                  loop
                  muted
                  playsInline
                  draggable={false}
                />
              ) : (
                <img
                  src={sticker.src}
                  alt="sticker"
                  className="rounded-lg pointer-events-none"
                  style={{ maxWidth: `${maxDim}px`, maxHeight: `${maxDim}px` }}
                  draggable={false}
                />
              )}
              {selectedImageId === sticker.id && (
                <div className="absolute inset-0 border-2 border-white/60 rounded-lg pointer-events-none" />
              )}
            </div>
          );
        })}

        {/* Text overlays */}
        {textOverlays.map((overlay) => (
          <div
            key={overlay.id}
            className={`absolute select-none group ${deletingId === overlay.id ? 'opacity-0 scale-75' : ''}`}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              touchAction: 'none',
              willChange: 'transform',
              transition: deletingId === overlay.id ? 'opacity 0.2s, transform 0.2s' : 'none',
            }}
            onPointerDown={(e) => onOverlayDown(e, overlay.id)}
          >
            <div style={{
              fontSize: `${overlay.fontSize}px`,
              fontWeight: overlay.fontWeight,
              fontStyle: overlay.fontStyle,
              textAlign: overlay.textAlign,
              color: overlay.color,
              backgroundColor: overlay.bgColor,
              borderRadius: overlay.bgColor !== 'transparent' ? '8px' : undefined,
              padding: overlay.bgColor !== 'transparent' ? '4px 10px' : undefined,
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              whiteSpace: 'pre-wrap',
              maxWidth: '260px',
            }}>
              {overlay.text}
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleRemoveOverlay(overlay.id); }}
              className="absolute -top-2 -right-2 size-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="size-3" />
            </button>
          </div>
        ))}

        {/* Emoji / info stickers */}
        {emojiStickers.map((sticker) => (
          <div
            key={sticker.id}
            className={`absolute select-none group ${deletingId === sticker.id ? 'opacity-0 scale-75' : ''}`}
            style={{
              left: `${sticker.x}%`,
              top: `${sticker.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              touchAction: 'none',
              willChange: 'transform',
              transition: deletingId === sticker.id ? 'opacity 0.2s, transform 0.2s' : 'none',
            }}
            onPointerDown={(e) => onOverlayDown(e, sticker.id)}
          >
            {sticker.type === 'emoji' ? (
              <span className="text-4xl drop-shadow-lg">{sticker.content}</span>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-sm font-medium shadow-lg">
                {getInfoIcon(sticker.infoType)}
                <span>{sticker.content}</span>
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleRemoveOverlay(sticker.id); }}
              className="absolute -top-2 -right-2 size-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="size-3" />
            </button>
          </div>
        ))}

        {/* Trash zone */}
        {showTrash && (
          <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-center z-50 pointer-events-none
            ${overTrash ? 'bg-destructive/60 h-24' : 'bg-black/40 h-20'}`}
            style={{ backdropFilter: 'blur(4px)', transition: 'all 0.15s ease-out' }}
          >
            <Trash2 className={`${overTrash ? 'size-10 text-white' : 'size-7 text-white/70'}`}
              style={{ transition: 'all 0.15s ease-out' }} />
          </div>
        )}
      </div>

      {/* Tool panels */}
      {activeTool === 'text' && (
        <div className="fixed inset-0 z-[120]" style={{ touchAction: 'auto' }}>
          <StoryTextOverlay onAdd={(overlay) => { handleAddText(overlay); setActiveTool(null); }} onClose={() => setActiveTool(null)} />
        </div>
      )}
      {activeTool === 'sticker' && (
        <div className="fixed inset-0 z-[120]" style={{ touchAction: 'auto' }}>
          <StoryStickerPicker onAdd={(sticker) => { handleAddSticker(sticker); setActiveTool(null); }} onClose={() => setActiveTool(null)} />
        </div>
      )}
      {activeTool === 'filter' && (
        <div className="fixed inset-0 z-[120]" style={{ touchAction: 'auto' }}>
          <StoryFilterPicker
            previewUrl={previewUrl}
            selected={selectedFilter}
            onSelect={(id) => setSelectedFilter(id)}
            onClose={() => setActiveTool(null)}
          />
        </div>
      )}
    </div>
  );
};

export default StoryEditor;
