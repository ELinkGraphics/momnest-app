import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Type, Sticker, Sparkles, PenTool, Trash2, Eye, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { StoryState, StoryElement, DrawingPath, EditorExtraData } from '@/types/storyTypes';
import { StoryCanvas, CANVAS_W, CANVAS_H } from './StoryCanvas';
import { StoryDrawingOverlay } from './StoryDrawingOverlay';
import StoryTextOverlay from './StoryTextOverlay';
import StoryStickerPicker from './StoryStickerPicker';
import StoryFilterPicker from './StoryFilterPicker';
import { CustomFilePicker, useFileManager } from '@/components/CustomFilePicker';

interface Props {
  previewUrl: string;
  mediaType?: 'image' | 'video';
  initialPostElements?: { postCardImageUrl?: string };
  resharedPostId?: string;
  onDone: (editedImageBlob: Blob, mentionedUserIds?: string[], extraData?: EditorExtraData) => void;
  onCancel: () => void;
}

export function StoryEditor({ previewUrl, mediaType = 'image', initialPostElements, resharedPostId, onDone, onCancel }: Props) {
  const [state, setState] = useState<StoryState>({
    background: { type: mediaType, value: previewUrl, x: 50, y: 50, scale: 1, rotation: 0 },
    elements: [],
    drawingPaths: []
  });

  const [activeTool, setActiveTool] = useState<'text' | 'sticker' | 'filter' | 'draw' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Canvas interaction refs
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Multi-touch gesture tracking
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureStateRef = useRef<{
    id: string;
    elStartX: number;
    elStartY: number;
    elStartScale: number;
    elStartRot: number;
    gestureStartDist: number | null;
    gestureStartAngle: number | null;
    gestureStartCenter: { x: number; y: number } | null;
  } | null>(null);

  // Mirrors of state/flags so pointer handlers read fresh values without re-binding
  const selectedIdRef = useRef<string | null>(null);
  const isOverTrashRef = useRef(false);
  const gestureMovedRef = useRef(false);      // did the active gesture move past the tap threshold?
  const usedSecondFingerRef = useRef(false);  // did a 2nd finger join this gesture?
  const downHitOverlayRef = useRef<string | null>(null); // overlay id the first finger landed on (null = empty)
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { isOverTrashRef.current = isOverTrash; }, [isOverTrash]);

  // Build the pseudo-element used to drive background gestures
  const backgroundElement = useCallback((): StoryElement => ({
    id: 'background',
    type: stateRef.current.background.type as any,
    content: '',
    x: stateRef.current.background.x ?? 50,
    y: stateRef.current.background.y ?? 50,
    scale: stateRef.current.background.scale ?? 1,
    rotation: stateRef.current.background.rotation ?? 0,
    zIndex: -1,
  }), []);

  // File manager for image stickers
  const imageStickerManager = useFileManager();

  // Initialize elements
  useEffect(() => {
    if (initialPostElements?.postCardImageUrl && state.elements.length === 0) {
      setState(prev => ({
        ...prev,
        elements: [{
          id: 'post-card',
          type: 'image',
          content: initialPostElements.postCardImageUrl,
          x: 50, y: 50, scale: 1, rotation: 0, zIndex: 1
        }]
      }));
    }
  }, [initialPostElements]);

  // Detect media aspect ratio and set objectFit mode
  useEffect(() => {
    if (!previewUrl) return;

    const canvasRatio = CANVAS_W / CANVAS_H; // 9:16 = 0.5625
    const tolerance = 0.08; // ~8% tolerance

    const updateState = (width: number, height: number) => {
      const mediaRatio = width / height;
      const needsContain = Math.abs(mediaRatio - canvasRatio) > tolerance;

      setState(prev => ({
        ...prev,
        background: {
          ...prev.background,
          mediaWidth: width,
          mediaHeight: height,
          objectFit: needsContain ? 'contain' : 'cover',
        }
      }));
    };

    if (mediaType === 'image') {
      const img = new Image();
      img.onload = () => updateState(img.width, img.height);
      img.src = previewUrl;
    } else if (mediaType === 'video') {
      const video = document.createElement('video');
      video.onloadedmetadata = () => updateState(video.videoWidth, video.videoHeight);
      video.src = previewUrl;
      video.load();
    }
  }, [previewUrl, mediaType]);

  // Recalculate the gesture baseline from the current pointer positions and element state
  const updateGestureBaseline = useCallback((el: StoryElement) => {
    const pts = Array.from(pointersRef.current.values());
    let dist = null;
    let angle = null;
    let center = null;

    if (pts.length === 1) {
      center = { x: pts[0].x, y: pts[0].y };
    } else if (pts.length >= 2) {
      const p1 = pts[0];
      const p2 = pts[1];
      dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    gestureStateRef.current = {
      id: el.id,
      elStartX: el.x,
      elStartY: el.y,
      elStartScale: el.scale,
      elStartRot: el.rotation,
      gestureStartDist: dist,
      gestureStartAngle: angle,
      gestureStartCenter: center
    };
  }, []);

  // Hit test against the ACTUAL rendered bounds of each overlay element.
  // Returns the top-most overlay under the point, or null when the point is on
  // empty canvas / background.
  const hitTestElement = useCallback((clientX: number, clientY: number): StoryElement | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Top-most z-index first so stacked overlays resolve correctly.
    const sorted = [...stateRef.current.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    const pad = 10; // px of slack to make small stickers easier to grab

    for (const el of sorted) {
      const node = canvas.querySelector(`[data-el-id="${el.id}"]`) as HTMLElement | null;
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (
        clientX >= r.left - pad && clientX <= r.right + pad &&
        clientY >= r.top - pad && clientY <= r.bottom + pad
      ) {
        return el;
      }
    }

    // No overlay hit → background.
    return null;
  }, []);

  // ─── Pointer handlers (all at canvas level for reliable multi-touch) ───

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isPreviewMode || activeTool) return;

    // Don't interfere with UI buttons / toolbars
    if ((e.target as HTMLElement).closest('[data-editor-controls]')) return;

    e.preventDefault();
    // Capture so the whole gesture (incl. dragging over the bottom toolbar to the
    // trash zone) keeps delivering pointer events to the canvas.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      gestureMovedRef.current = false;
      usedSecondFingerRef.current = false;

      const hitEl = hitTestElement(e.clientX, e.clientY); // overlay | null
      downHitOverlayRef.current = hitEl ? hitEl.id : null;

      if (hitEl) {
        // Touched an overlay → select it and manipulate it.
        setSelectedId(hitEl.id);
        selectedIdRef.current = hitEl.id;
        setIsDragging(true);
        updateGestureBaseline(hitEl);
      } else {
        // Touched empty space → a single finger drives the background (pan).
        // Selection is kept for now; a plain tap here de-selects on pointer up,
        // and a 2nd finger (pinch) re-targets the selected overlay below.
        updateGestureBaseline(backgroundElement());
      }
    } else if (pointersRef.current.size >= 2) {
      // Second finger joins → this is a pinch/rotate.
      usedSecondFingerRef.current = true;

      // The subject is the current selection: selected overlay, else background.
      const selId = selectedIdRef.current;
      const target = selId
        ? stateRef.current.elements.find(el => el.id === selId) ?? null
        : null;

      if (target) {
        setIsDragging(true);
        updateGestureBaseline(target);
      } else {
        updateGestureBaseline(backgroundElement());
      }
    }
  }, [isPreviewMode, activeTool, hitTestElement, updateGestureBaseline, backgroundElement]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPreviewMode || !gestureStateRef.current) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const pts = Array.from(pointersRef.current.values());
    const g = gestureStateRef.current;

    // Mark the gesture as a real move (vs. a tap) once it travels past a threshold.
    if (g.gestureStartCenter) {
      const moved = Math.hypot(pts[0].x - g.gestureStartCenter.x, pts[0].y - g.gestureStartCenter.y);
      if (moved > 6) gestureMovedRef.current = true;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    let newX = g.elStartX;
    let newY = g.elStartY;
    let newScale = g.elStartScale;
    let newRot = g.elStartRot;
    
    if (pts.length === 1 && g.gestureStartCenter) {
      // Single finger drag
      const dx = pts[0].x - g.gestureStartCenter.x;
      const dy = pts[0].y - g.gestureStartCenter.y;
      newX = g.elStartX + (dx / rect.width) * 100;
      newY = g.elStartY + (dy / rect.height) * 100;
    } 
    else if (pts.length >= 2 && g.gestureStartDist !== null && g.gestureStartAngle !== null && g.gestureStartCenter) {
      // Multi-finger: pinch + rotate + drag
      const p1 = pts[0];
      const p2 = pts[1];
      
      const curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const curAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      const curCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      
      // Scale
      const scaleDelta = curDist / (g.gestureStartDist || 1);
      newScale = Math.max(0.1, Math.min(5, g.elStartScale * scaleDelta));
      
      // Rotation
      const angleDelta = curAngle - g.gestureStartAngle;
      newRot = g.elStartRot + angleDelta;
      
      // Pan (from center movement)
      const dx = curCenter.x - g.gestureStartCenter.x;
      const dy = curCenter.y - g.gestureStartCenter.y;
      newX = g.elStartX + (dx / rect.width) * 100;
      newY = g.elStartY + (dy / rect.height) * 100;
    }
    
    setState(prev => {
      if (g.id === 'background') {
        return {
          ...prev,
          background: {
            ...prev.background,
            x: newX,
            y: newY,
            scale: newScale,
            rotation: newRot
          }
        };
      } else {
        return {
          ...prev,
          elements: prev.elements.map(el => 
            el.id === g.id ? { ...el, x: newX, y: newY, scale: newScale, rotation: newRot } : el
          )
        };
      }
    });
    
    // Trash only applies to overlay elements (the background can't be deleted).
    const overlayTarget = g.id !== 'background';
    const maxY = Math.max(...pts.map(p => p.y));
    const over = overlayTarget && maxY > window.innerHeight - 100;
    isOverTrashRef.current = over;
    setIsOverTrash(over);
  }, [isPreviewMode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    pointersRef.current.delete(e.pointerId);

    const g = gestureStateRef.current;

    // Dropped an overlay onto the trash zone → delete it.
    if (isOverTrashRef.current && g && g.id !== 'background') {
      const id = g.id;
      setState(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== id) }));
      setSelectedId(null);
      selectedIdRef.current = null;
      gestureStateRef.current = null;
      pointersRef.current.clear();
      setIsDragging(false);
      setIsOverTrash(false);
      isOverTrashRef.current = false;
      return;
    }

    if (pointersRef.current.size > 0 && g) {
      // A finger lifted but others remain → re-baseline for a smooth transition.
      const el = g.id === 'background'
        ? backgroundElement()
        : stateRef.current.elements.find(el => el.id === g.id);
      if (el) updateGestureBaseline(el);
      return;
    }

    // All fingers lifted.
    if (!gestureMovedRef.current && !usedSecondFingerRef.current) {
      // It was a tap: on an overlay → keep it selected; on empty → de-select.
      if (downHitOverlayRef.current) {
        setSelectedId(downHitOverlayRef.current);
        selectedIdRef.current = downHitOverlayRef.current;
      } else {
        setSelectedId(null);
        selectedIdRef.current = null;
      }
    }

    gestureStateRef.current = null;
    setIsDragging(false);
    setIsOverTrash(false);
    isOverTrashRef.current = false;
  }, [updateGestureBaseline, backgroundElement]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureStateRef.current = null;
      setIsDragging(false);
      setIsOverTrash(false);
      isOverTrashRef.current = false;
    }
  }, []);

  // Prevent default touch behaviors on the editor container
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    
    const preventTouch = (e: TouchEvent) => {
      // Only prevent when we have an active gesture or more than 1 touch
      if (gestureStateRef.current || e.touches.length > 1) {
        e.preventDefault();
      }
    };
    
    el.addEventListener('touchstart', preventTouch, { passive: false });
    el.addEventListener('touchmove', preventTouch, { passive: false });
    
    return () => {
      el.removeEventListener('touchstart', preventTouch);
      el.removeEventListener('touchmove', preventTouch);
    };
  }, []);

  const handleAddText = (overlay: any) => {
    const newElement: StoryElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'text',
      content: overlay.text,
      x: overlay.x, y: overlay.y,
      scale: 1, rotation: 0, zIndex: Date.now(),
      fontSize: overlay.fontSize,
      fontWeight: overlay.fontWeight,
      fontStyle: overlay.fontStyle,
      textAlign: overlay.textAlign,
      color: overlay.color,
      bgColor: overlay.bgColor
    };
    setState(prev => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedId(newElement.id);
    selectedIdRef.current = newElement.id;
    setActiveTool(null);
  };

  const handleAddSticker = (sticker: any) => {
    const newElement: StoryElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: sticker.type === 'emoji' ? 'emoji' : 'info',
      content: sticker.content,
      infoType: sticker.infoType,
      mentionUserId: sticker.mentionUserId,
      x: 50, y: 50, scale: 1, rotation: 0, zIndex: Date.now()
    };
    setState(prev => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedId(newElement.id);
    selectedIdRef.current = newElement.id;
    setActiveTool(null);
  };

  const handleAddImageSticker = (file: File | Blob) => {
    const url = URL.createObjectURL(file);
    const newElement: StoryElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'image',
      content: url,
      file: file,
      x: 50, y: 50, scale: 1, rotation: 0, zIndex: Date.now()
    };
    setState(prev => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedId(newElement.id);
    selectedIdRef.current = newElement.id;
  };

  // Watch for new image stickers
  useEffect(() => {
    const item = imageStickerManager.files[0];
    if (item) {
      handleAddImageSticker(item.file);
      imageStickerManager.removeFile(item.id);
    }
  }, [imageStickerManager.files]);

  const handleDone = async () => {
    if (isSharing) return;
    setIsSharing(true);
    
    try {
      let blob: Blob;
      if (previewUrl.startsWith('blob:') || previewUrl.startsWith('data:')) {
        blob = await fetch(previewUrl).then(r => r.blob());
      } else {
        blob = new Blob(['empty'], { type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg' });
      }
      
      // Extract mentions
      const mentionedUserIds = state.elements
        .filter(e => e.infoType === 'mention' && e.mentionUserId)
        .map(e => e.mentionUserId as string);

      onDone(blob, mentionedUserIds, {
        mediaType: mediaType,
        originalVideoUrl: mediaType === 'video' ? previewUrl : undefined,
        story_state: state
      });
    } catch (e) {
      console.error('Failed to finalize story canvas:', e);
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden" style={{ touchAction: 'none' }}>
      
      {/* Top Bar */}
      <div 
        data-editor-controls
        className={`absolute top-0 inset-x-0 flex items-center justify-between p-4 z-20 transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <button onClick={onCancel} className="p-2 rounded-full bg-white/10 text-white backdrop-blur-md">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-semibold drop-shadow-md">Your story</span>
        <button onClick={() => setIsPreviewMode(true)} className="p-2 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors">
          <Eye className="w-6 h-6" />
        </button>
      </div>

      {/* Canvas Area — all pointer events are captured here */}
      <div 
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out ${isPreviewMode ? 'p-0' : 'p-4 md:py-8'}`}
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: 'none' }}
      >
        <div 
          className={`relative w-full h-full mx-auto flex items-center justify-center transition-all duration-300 ease-in-out ${isPreviewMode ? 'max-w-full max-h-full' : 'md:max-w-[450px] md:max-h-[85vh]'}`}
        >
          <StoryCanvas state={state}>
            
            {/* Interactive Layer: visual selection rings on selected elements */}
            {!isPreviewMode && state.elements.map(el => (
              <div
                key={el.id}
                className="absolute origin-center pointer-events-none"
                style={{
                  left: `${el.x}%`, top: `${el.y}%`,
                  transform: `translate(-50%, -50%) scale(${el.scale}) rotate(${el.rotation}deg)`,
                }}
              >
                {selectedId === el.id && (
                  <div className="ring-2 ring-white ring-offset-2 ring-offset-black/50 rounded-lg p-2 min-w-[60px] min-h-[40px]" />
                )}
              </div>
            ))}
            
            {/* Safe Zone Overlay */}
            {!isPreviewMode && selectedId && (
              <div className="absolute inset-0 pointer-events-none border-[2px] border-dashed border-white/30 rounded-3xl z-[200]">
                <div className="absolute top-0 inset-x-0 h-[250px] bg-red-500/10 border-b border-dashed border-red-500/50" />
                <div className="absolute bottom-0 inset-x-0 h-[250px] bg-red-500/10 border-t border-dashed border-red-500/50" />
              </div>
            )}
          </StoryCanvas>
        </div>

        {/* Right Floating Toolbar */}
        <div 
          data-editor-controls
          className={`absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 bg-black/40 backdrop-blur-md p-2 rounded-full z-20 transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          <button onClick={() => setActiveTool('text')} className="p-3 text-white hover:bg-white/20 rounded-full">
            <Type className="w-6 h-6" />
          </button>
          <button onClick={() => setActiveTool('sticker')} className="p-3 text-white hover:bg-white/20 rounded-full">
            <Sticker className="w-6 h-6" />
          </button>
          <CustomFilePicker
            manager={imageStickerManager}
            accept="image/*"
            hidePreviewList
            expandInline
            expandDirection="left"
          >
            <div className="p-3 text-white hover:bg-white/20 rounded-full cursor-pointer">
              <ImageIcon className="w-6 h-6" />
            </div>
          </CustomFilePicker>
          <button onClick={() => setActiveTool('draw')} className="p-3 text-white hover:bg-white/20 rounded-full">
            <PenTool className="w-6 h-6" />
          </button>
          <button onClick={() => setActiveTool('filter')} className="p-3 text-white hover:bg-white/20 rounded-full">
            <Sparkles className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div 
        data-editor-controls
        className={`absolute bottom-0 inset-x-0 p-4 z-20 flex justify-end items-center transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <button 
          onClick={handleDone} 
          disabled={isSharing}
          className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold shadow-lg active:scale-95 transition-transform hover:bg-gray-100 disabled:opacity-70 disabled:pointer-events-none"
        >
          {isSharing ? (
            <>
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span>Sharing...</span>
            </>
          ) : (
            <>Share <ChevronRight className="w-5 h-5" /></>
          )}
        </button>
      </div>

      {/* Trash Zone — visible when dragging */}
      <div className={`absolute bottom-0 inset-x-0 h-[100px] bg-gradient-to-t from-red-600/80 to-transparent flex items-center justify-center z-[150] transition-opacity duration-200 pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`p-4 rounded-full bg-black/50 text-white transition-transform duration-150 ${isOverTrash ? 'scale-125 bg-red-600' : ''}`}>
          <Trash2 className="w-8 h-8" />
        </div>
      </div>

      {/* Tool Overlays */}
      {activeTool === 'text' && <StoryTextOverlay onAdd={handleAddText} onClose={() => setActiveTool(null)} />}
      {activeTool === 'sticker' && <StoryStickerPicker onAdd={handleAddSticker} onClose={() => setActiveTool(null)} />}
      {activeTool === 'filter' && (
        <div className="absolute inset-x-0 bottom-0 z-[150]">
          <StoryFilterPicker 
            previewUrl={previewUrl}
            selectedId={state.background.filterCss || 'none'} 
            onSelect={(id, css) => {
              setState(prev => ({ ...prev, background: { ...prev.background, filterCss: css } }));
            }} 
            onClose={() => setActiveTool(null)} 
          />
        </div>
      )}
      
      {/* Drawing Overlay */}
      <StoryDrawingOverlay 
        isActive={activeTool === 'draw'} 
        initialPaths={state.drawingPaths}
        onDone={(paths) => {
          setState(prev => ({ ...prev, drawingPaths: paths }));
          setActiveTool(null);
        }}
        onCancel={() => setActiveTool(null)}
      />

      {/* Preview Mode Exit */}
      {isPreviewMode && (
        <button 
          onClick={() => setIsPreviewMode(false)}
          className="absolute top-12 left-4 z-[200] p-3 rounded-full bg-black/50 text-white backdrop-blur-md active:scale-90"
        >
          <X className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

export default StoryEditor;
