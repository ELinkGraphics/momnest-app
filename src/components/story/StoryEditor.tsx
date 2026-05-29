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

  // Hit test: find which element is under a given screen coordinate
  const hitTestElement = useCallback((clientX: number, clientY: number): StoryElement | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Convert to percentage coordinates within the canvas
    const pctX = ((clientX - rect.left) / rect.width) * 100;
    const pctY = ((clientY - rect.top) / rect.height) * 100;

    // Check elements in reverse z-order (top-most first)
    const sorted = [...stateRef.current.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    
    for (const el of sorted) {
      // Calculate a reasonable hit radius based on element type and scale
      let hitW = 8; // percent of canvas width
      let hitH = 5; // percent of canvas height
      
      if (el.type === 'text') {
        hitW = 15;
        hitH = 5;
      } else if (el.type === 'emoji') {
        hitW = 8;
        hitH = 5;
      } else if (el.type === 'info') {
        hitW = 18;
        hitH = 4;
      } else if (el.type === 'image') {
        hitW = 15;
        hitH = 10;
      }
      
      // Scale the hit area with the element's scale
      hitW *= el.scale;
      hitH *= el.scale;

      // Simple AABB check (ignores rotation, but good enough for touch)
      if (
        pctX >= el.x - hitW && pctX <= el.x + hitW &&
        pctY >= el.y - hitH && pctY <= el.y + hitH
      ) {
        return el;
      }
    }
    
    // If no element hit, return the background!
    return {
      id: 'background',
      type: stateRef.current.background.type as any,
      x: stateRef.current.background.x ?? 50,
      y: stateRef.current.background.y ?? 50,
      scale: stateRef.current.background.scale ?? 1,
      rotation: stateRef.current.background.rotation ?? 0,
      zIndex: -1
    };
  }, []);

  // ─── Pointer handlers (all at canvas level for reliable multi-touch) ───

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isPreviewMode || activeTool) return;
    
    // Don't interfere with UI buttons
    if ((e.target as HTMLElement).closest('[data-editor-controls]')) return;
    
    e.preventDefault();
    
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      // First finger: hit-test and start drag
      const hitEl = hitTestElement(e.clientX, e.clientY);
      if (hitEl) {
        setSelectedId(hitEl.id);
        setIsDragging(true);
        updateGestureBaseline(hitEl);
      } else {
        setSelectedId(null);
        setIsDragging(false);
        gestureStateRef.current = null;
      }
    } else if (pointersRef.current.size >= 2 && gestureStateRef.current) {
      // Second finger added while dragging: transition to pinch/rotate
      const id = gestureStateRef.current.id;
      let el;
      if (id === 'background') {
        el = { 
          id: 'background', 
          x: stateRef.current.background.x ?? 50, 
          y: stateRef.current.background.y ?? 50, 
          scale: stateRef.current.background.scale ?? 1, 
          rotation: stateRef.current.background.rotation ?? 0,
          type: 'image' as any,
          zIndex: -1
        };
      } else {
        el = stateRef.current.elements.find(e => e.id === id);
      }
      if (el) updateGestureBaseline(el);
    }
  }, [isPreviewMode, activeTool, hitTestElement, updateGestureBaseline]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPreviewMode || !gestureStateRef.current) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const pts = Array.from(pointersRef.current.values());
    const g = gestureStateRef.current;
    
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
    
    // Check if over trash zone (bottom 100px of screen)
    const maxY = Math.max(...pts.map(p => p.y));
    setIsOverTrash(maxY > window.innerHeight - 100);
  }, [isPreviewMode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    
    pointersRef.current.delete(e.pointerId);
    
    if (isOverTrash && gestureStateRef.current) {
      // Delete the element
      const id = gestureStateRef.current.id;
      if (id !== 'background') {
        setState(prev => ({
          ...prev,
          elements: prev.elements.filter(el => el.id !== id)
        }));
      }
      setSelectedId(null);
      gestureStateRef.current = null;
      pointersRef.current.clear();
      setIsDragging(false);
      setIsOverTrash(false);
    } else if (pointersRef.current.size > 0 && gestureStateRef.current) {
      // A finger was lifted but others remain: re-baseline for smooth transition
      const id = gestureStateRef.current.id;
      let el;
      if (id === 'background') {
         el = { 
          id: 'background', 
          x: stateRef.current.background.x ?? 50, 
          y: stateRef.current.background.y ?? 50, 
          scale: stateRef.current.background.scale ?? 1, 
          rotation: stateRef.current.background.rotation ?? 0,
          type: 'image' as any,
          zIndex: -1
        };
      } else {
        el = stateRef.current.elements.find(e => e.id === id);
      }
      if (el) updateGestureBaseline(el);
    } else {
      // All fingers lifted
      gestureStateRef.current = null;
      setIsDragging(false);
      setIsOverTrash(false);
    }
  }, [isOverTrash, updateGestureBaseline]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureStateRef.current = null;
      setIsDragging(false);
      setIsOverTrash(false);
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
      // We need to return a blob for the media_url. 
      // We can fetch the previewUrl to get the original blob.
      const blob = await fetch(previewUrl).then(r => r.blob());
      
      // Extract mentions
      const mentionedUserIds = state.elements
        .filter(e => e.infoType === 'mention' && e.mentionUserId)
        .map(e => e.mentionUserId as string);

      onDone(blob, mentionedUserIds, {
        mediaType: mediaType,
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
