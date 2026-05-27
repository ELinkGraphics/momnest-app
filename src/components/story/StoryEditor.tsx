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
    background: { type: mediaType, value: previewUrl },
    elements: [],
    drawingPaths: []
  });

  const [activeTool, setActiveTool] = useState<'text' | 'sticker' | 'filter' | 'draw' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);

  // Canvas interaction refs
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const gestureStateRef = useRef<{
    id: string;
    elStartX: number;
    elStartY: number;
    elStartScale: number;
    elStartRot: number;
    gestureStartDist: number | null;
    gestureStartAngle: number | null;
    gestureStartCenter: { x: number, y: number } | null;
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

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (isPreviewMode) return;
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    
    setSelectedId(id);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const el = stateRef.current.elements.find(e => e.id === id);
    if (el) updateGestureBaseline(el);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (isPreviewMode) return;
    
    if (selectedId) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const el = stateRef.current.elements.find(el => el.id === selectedId);
      if (el) updateGestureBaseline(el);
    } else {
      setSelectedId(null);
    }
  };

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isPreviewMode || !gestureStateRef.current) return;
      
      if (pointersRef.current.has(e.pointerId)) {
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
          const dx = pts[0].x - g.gestureStartCenter.x;
          const dy = pts[0].y - g.gestureStartCenter.y;
          newX = g.elStartX + (dx / rect.width) * 100;
          newY = g.elStartY + (dy / rect.height) * 100;
        } 
        else if (pts.length >= 2 && g.gestureStartDist !== null && g.gestureStartAngle !== null && g.gestureStartCenter) {
          const p1 = pts[0];
          const p2 = pts[1];
          
          const curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const curAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
          const curCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          
          const scaleDelta = curDist / (g.gestureStartDist || 1);
          newScale = Math.max(0.1, g.elStartScale * scaleDelta); // Prevent scaling to 0
          
          const angleDelta = curAngle - g.gestureStartAngle;
          newRot = g.elStartRot + angleDelta;
          
          const dx = curCenter.x - g.gestureStartCenter.x;
          const dy = curCenter.y - g.gestureStartCenter.y;
          newX = g.elStartX + (dx / rect.width) * 100;
          newY = g.elStartY + (dy / rect.height) * 100;
        }
        
        setState(prev => ({
          ...prev,
          elements: prev.elements.map(el => 
            el.id === g.id ? { ...el, x: newX, y: newY, scale: newScale, rotation: newRot } : el
          )
        }));
        
        if (e.clientY > window.innerHeight - 100) {
          setIsOverTrash(true);
        } else {
          setIsOverTrash(false);
        }
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.delete(e.pointerId);
        
        if (isOverTrash && gestureStateRef.current) {
          const id = gestureStateRef.current.id;
          setState(prev => ({
            ...prev,
            elements: prev.elements.filter(el => el.id !== id)
          }));
          setSelectedId(null);
          gestureStateRef.current = null;
          pointersRef.current.clear();
        } 
        else if (pointersRef.current.size > 0 && gestureStateRef.current) {
          const el = stateRef.current.elements.find(el => el.id === gestureStateRef.current!.id);
          if (el) updateGestureBaseline(el);
        } 
        else {
          gestureStateRef.current = null;
        }
        
        setIsOverTrash(false);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isPreviewMode, isOverTrash, updateGestureBaseline]);

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
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden" style={{ touchAction: 'none' }}>
      
      {/* Top Bar */}
      <div className={`absolute top-0 inset-x-0 flex items-center justify-between p-4 z-20 transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button onClick={onCancel} className="p-2 rounded-full bg-white/10 text-white backdrop-blur-md">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-semibold drop-shadow-md">Your story</span>
        <button onClick={() => setIsPreviewMode(true)} className="p-2 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors">
          <Eye className="w-6 h-6" />
        </button>
      </div>

      {/* Canvas Area */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out ${isPreviewMode ? 'p-0' : 'p-4 md:py-8'}`}>
        <div 
          className={`relative w-full h-full mx-auto flex items-center justify-center transition-all duration-300 ease-in-out ${isPreviewMode ? 'max-w-full max-h-full' : 'md:max-w-[450px] md:max-h-[85vh]'}`}
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
        >
          {/* We pass children to StoryCanvas to render the interactive overlays ON TOP of the scaled elements */}
          <StoryCanvas state={state}>
            
            {/* Interactive Layer (rendered inside the 1080x1920 scaled space) */}
            {!isPreviewMode && state.elements.map(el => (
              <div
                key={el.id}
                className="absolute origin-center"
                style={{
                  left: `${el.x}%`, top: `${el.y}%`,
                  transform: `translate(-50%, -50%) scale(${el.scale}) rotate(${el.rotation}deg)`,
                  width: '100%', height: '100%', // Take full canvas size, then use pointer-events to isolate
                  pointerEvents: 'none'
                }}
              >
                {/* The actual hit box */}
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-move ${selectedId === el.id ? 'ring-2 ring-white ring-offset-2 ring-offset-black rounded-lg' : ''}`}
                  style={{ minWidth: '100px', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onPointerDown={(e) => handlePointerDown(e, el.id)}
                >
                  {/* We don't render the content here, StoryCanvas does. We just overlay a hit box. 
                      Wait, this is an invisible hit box over the element. 
                      Actually, rendering the hit box this way works to capture dragging. */}
                </div>
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
        <div className={`absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 bg-black/40 backdrop-blur-md p-2 rounded-full z-20 transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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
      <div className={`absolute bottom-0 inset-x-0 p-4 z-20 flex justify-end items-center transition-opacity duration-300 ${isPreviewMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button onClick={handleDone} className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold shadow-lg active:scale-95 transition-transform hover:bg-gray-100">
          Share <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Trash Zone */}
      <div className={`absolute bottom-0 inset-x-0 h-[100px] bg-gradient-to-t from-red-600/80 to-transparent flex items-center justify-center z-[150] transition-opacity duration-200 pointer-events-none ${gestureStateRef.current ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`p-4 rounded-full bg-black/50 text-white transition-transform ${isOverTrash ? 'scale-125 bg-red-600' : ''}`}>
          <Trash2 className="w-8 h-8" />
        </div>
      </div>

      {/* Tool Overlays */}
      {activeTool === 'text' && <StoryTextOverlay onAdd={handleAddText} onClose={() => setActiveTool(null)} />}
      {activeTool === 'sticker' && <StoryStickerPicker onAdd={handleAddSticker} onClose={() => setActiveTool(null)} />}
      {activeTool === 'filter' && (
        <div className="absolute inset-x-0 bottom-0 z-[150]">
          <StoryFilterPicker 
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

