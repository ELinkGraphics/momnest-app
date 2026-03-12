import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { Area } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut, RotateCw, RotateCcw, FlipHorizontal, FlipVertical, RefreshCw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

// Generate a flipped version of the image via canvas
const createFlippedImage = (src: string, flipH: boolean, flipV: boolean): Promise<string> => {
  return new Promise((resolve) => {
    if (!flipH && !flipV) { resolve(src); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(flipH ? img.width : 0, flipV ? img.height : 0);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
};

interface ImageCropperProps {
  imageSrc: string;
  aspectRatio?: number;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  cropShape?: 'rect' | 'round';
  dimensionLabel?: string;
}

const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  flipH: boolean,
  flipV: boolean
): Promise<Blob> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }

      const radians = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));

      const bBoxWidth = image.width * cos + image.height * sin;
      const bBoxHeight = image.width * sin + image.height * cos;

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = bBoxWidth;
      tempCanvas.height = bBoxHeight;
      const tempCtx = tempCanvas.getContext('2d')!;

      tempCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
      tempCtx.rotate(radians);
      tempCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      tempCtx.translate(-image.width / 2, -image.height / 2);
      tempCtx.drawImage(image, 0, 0);

      ctx.drawImage(
        tempCanvas,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0,
        pixelCrop.width, pixelCrop.height
      );

      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Blob failed')); },
        'image/jpeg',
        0.92
      );
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
};

const ASPECT_PRESETS = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  aspectRatio: initialAspect = 1,
  onCropComplete,
  onCancel,
  cropShape = 'rect',
  dimensionLabel,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aspect, setAspect] = useState<number | undefined>(initialAspect);
  const [activeControl, setActiveControl] = useState<'zoom' | 'rotate'>('zoom');
  const [flippedSrc, setFlippedSrc] = useState<string>(imageSrc);

  // Re-generate flipped image whenever flip state changes
  useEffect(() => {
    let cancelled = false;
    createFlippedImage(imageSrc, flipH, flipV).then((src) => {
      if (!cancelled) setFlippedSrc(src);
    });
    return () => { cancelled = true; };
  }, [imageSrc, flipH, flipV]);

  const onCropChange = useCallback((c: { x: number; y: number }) => setCrop(c), []);
  const onZoomChange = useCallback((z: number) => setZoom(z), []);

  const handleCropDone = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsSaving(true);
    try {
      const croppedBlob = await createCroppedImage(flippedSrc, croppedAreaPixels, rotation, false, false);
      onCropComplete(croppedBlob);
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspect(initialAspect);
  };

  const getDimensionHint = () => {
    if (dimensionLabel) return dimensionLabel;
    if (cropShape === 'round') return '400×400px (1:1)';
    if (aspect === 16 / 9) return '1200×675px (16:9)';
    if (aspect === 9 / 16) return '1080×1920px (9:16)';
    if (aspect === 1) return '400×400px (1:1)';
    return 'Free transform';
  };

  // Prevent any click/mouse events from reaching elements behind the overlay
  const stopAll = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const content = (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex flex-col select-none"
      onClick={stopAll}
      onMouseDown={stopAll}
      onTouchStart={stopAll as any}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 z-10 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 w-10 rounded-full bg-card/10 hover:bg-card/20 active:bg-card/30 border border-white/10 flex items-center justify-center transition-all"
        >
          <X className="h-5 w-5 text-white/90" />
        </button>
        <div className="text-center">
          <h2 className="text-white font-semibold text-base tracking-tight">Edit Photo</h2>
          <p className="text-secondary text-[11px] font-medium mt-0.5">{getDimensionHint()}</p>
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSaving}
          className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/90 active:bg-secondary/80 flex items-center justify-center transition-all disabled:opacity-50 shadow-lg shadow-secondary/30"
        >
          <Check className="h-5 w-5 text-secondary-foreground" />
        </button>
      </div>

      {/* Cropper Area */}
      <div className="flex-1 relative min-h-0">
        <Cropper
          image={flippedSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          cropShape={cropShape}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={handleCropDone}
          showGrid={true}
          minZoom={0.5}
          maxZoom={5}
          style={{
            containerStyle: { background: 'rgba(0,0,0,0.95)' },
          }}
          classes={{
            containerClassName: 'rounded-none',
          }}
        />
      </div>

      {/* Bottom Controls */}
      <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-black/80 pb-safe">
        {/* Aspect Ratio Pills */}
        {cropShape === 'rect' && (
          <div className="flex items-center justify-center gap-2 px-4 pt-3 pb-2">
            {ASPECT_PRESETS.map((preset) => {
              const isActive = preset.value === aspect || (preset.value === undefined && aspect === undefined);
              return (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => setAspect(preset.value)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-secondary text-secondary-foreground shadow-lg shadow-secondary/30'
                      : 'bg-card/8 text-white/60 hover:bg-card/15 hover:text-white/80 active:bg-card/20'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-1 px-4 pt-1 pb-2">
          <button
            type="button"
            onClick={() => setActiveControl('zoom')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeControl === 'zoom'
                ? 'bg-card/15 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Zoom
          </button>
          <button
            type="button"
            onClick={() => setActiveControl('rotate')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeControl === 'rotate'
                ? 'bg-card/15 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Rotate
          </button>
        </div>

        {/* Slider Area */}
        <div className="px-6 pb-2">
          {activeControl === 'zoom' ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
                className="h-8 w-8 rounded-full bg-card/8 hover:bg-card/15 active:bg-card/20 flex items-center justify-center transition-all"
              >
                <ZoomOut className="h-3.5 w-3.5 text-white/70" />
              </button>
              <div className="flex-1">
                <Slider
                  value={[zoom]}
                  min={0.5}
                  max={5}
                  step={0.05}
                  onValueChange={(val) => setZoom(val[0])}
                  className="[&_[role=slider]]:bg-secondary [&_[role=slider]]:border-secondary [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-secondary/30 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&>span:first-child]:bg-card/15 [&>span:first-child>span]:bg-secondary"
                />
              </div>
              <button
                type="button"
                onClick={() => setZoom(Math.min(5, zoom + 0.2))}
                className="h-8 w-8 rounded-full bg-card/8 hover:bg-card/15 active:bg-card/20 flex items-center justify-center transition-all"
              >
                <ZoomIn className="h-3.5 w-3.5 text-white/70" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRotation(r => r - 15)}
                className="h-8 w-8 rounded-full bg-card/8 hover:bg-card/15 active:bg-card/20 flex items-center justify-center transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5 text-white/70" />
              </button>
              <div className="flex-1">
                <Slider
                  value={[rotation]}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={(val) => setRotation(val[0])}
                  className="[&_[role=slider]]:bg-secondary [&_[role=slider]]:border-secondary [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-secondary/30 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&>span:first-child]:bg-card/15 [&>span:first-child>span]:bg-secondary"
                />
              </div>
              <button
                type="button"
                onClick={() => setRotation(r => r + 15)}
                className="h-8 w-8 rounded-full bg-card/8 hover:bg-card/15 active:bg-card/20 flex items-center justify-center transition-all"
              >
                <RotateCw className="h-3.5 w-3.5 text-white/70" />
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center gap-3 px-4 pt-1 pb-4">
          <button
            type="button"
            onClick={() => setFlipH(f => !f)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
              flipH ? 'bg-secondary/20 text-secondary' : 'text-white/50 hover:text-white/70 active:bg-card/10'
            }`}
          >
            <FlipHorizontal className="h-4 w-4" />
            <span className="text-[10px] font-medium">Flip H</span>
          </button>
          <button
            type="button"
            onClick={() => setFlipV(f => !f)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
              flipV ? 'bg-secondary/20 text-secondary' : 'text-white/50 hover:text-white/70 active:bg-card/10'
            }`}
          >
            <FlipVertical className="h-4 w-4" />
            <span className="text-[10px] font-medium">Flip V</span>
          </button>
          <button
            type="button"
            onClick={() => setRotation(r => (r + 90) % 360)}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-white/50 hover:text-white/70 active:bg-card/10 transition-all"
          >
            <RotateCw className="h-4 w-4" />
            <span className="text-[10px] font-medium">90°</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-white/50 hover:text-white/70 active:bg-card/10 transition-all"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="text-[10px] font-medium">Reset</span>
          </button>
        </div>
      </div>
    </div>
  );

  // Render via portal to escape parent form/label DOM context
  return createPortal(content, document.body);
};

export default ImageCropper;
