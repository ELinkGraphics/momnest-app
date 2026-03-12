import React, { useState } from 'react';
import { Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Check, X, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  bgColor: string;
}

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#007AFF', '#AF52DE', '#FF2D55', '#5856D6',
];

const BG_OPTIONS = [
  'transparent', 'rgba(0,0,0,0.6)', 'rgba(255,255,255,0.8)',
  'rgba(255,59,48,0.7)', 'rgba(0,122,255,0.7)', 'rgba(175,82,222,0.7)',
];

interface Props {
  onAdd: (overlay: TextOverlay) => void;
  onClose: () => void;
}

const StoryTextOverlay: React.FC<Props> = ({ onAdd, onClose }) => {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('normal');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [color, setColor] = useState('#FFFFFF');
  const [bgColor, setBgColor] = useState('transparent');

  const handleConfirm = () => {
    if (!text.trim()) return;
    onAdd({
      id: `text-${Date.now()}`,
      text: text.trim(),
      x: 50,
      y: 50,
      fontSize,
      fontWeight,
      fontStyle,
      textAlign,
      color,
      bgColor,
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20 bg-black/60 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="p-2 rounded-full bg-black/40 text-white">
          <X className="size-5" />
        </button>
        <Button size="sm" onClick={handleConfirm} disabled={!text.trim()}
          className="bg-primary text-primary-foreground rounded-full px-4">
          <Check className="size-4 mr-1" /> Done
        </Button>
      </div>

      {/* Text input area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something..."
          autoFocus
          maxLength={200}
          className="bg-transparent border-none outline-none resize-none text-center w-full max-w-[280px]"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight,
            fontStyle,
            textAlign,
            color,
            backgroundColor: bgColor,
            borderRadius: bgColor !== 'transparent' ? '8px' : undefined,
            padding: bgColor !== 'transparent' ? '8px 12px' : undefined,
          }}
          rows={3}
        />
      </div>

      {/* Tools */}
      <div className="p-3 space-y-3">
        {/* Font size slider */}
        <div className="flex items-center gap-3 px-2">
          <span className="text-white/70 text-xs">A</span>
          <input
            type="range" min={14} max={48} value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-white/70 text-lg font-bold">A</span>
        </div>

        {/* Format buttons */}
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setFontWeight(fontWeight === 'bold' ? 'normal' : 'bold')}
            className={`p-2 rounded-lg ${fontWeight === 'bold' ? 'bg-card/30' : 'bg-card/10'} text-white`}>
            <Bold className="size-4" />
          </button>
          <button onClick={() => setFontStyle(fontStyle === 'italic' ? 'normal' : 'italic')}
            className={`p-2 rounded-lg ${fontStyle === 'italic' ? 'bg-card/30' : 'bg-card/10'} text-white`}>
            <Italic className="size-4" />
          </button>
          <button onClick={() => setTextAlign('left')}
            className={`p-2 rounded-lg ${textAlign === 'left' ? 'bg-card/30' : 'bg-card/10'} text-white`}>
            <AlignLeft className="size-4" />
          </button>
          <button onClick={() => setTextAlign('center')}
            className={`p-2 rounded-lg ${textAlign === 'center' ? 'bg-card/30' : 'bg-card/10'} text-white`}>
            <AlignCenter className="size-4" />
          </button>
          <button onClick={() => setTextAlign('right')}
            className={`p-2 rounded-lg ${textAlign === 'right' ? 'bg-card/30' : 'bg-card/10'} text-white`}>
            <AlignRight className="size-4" />
          </button>
        </div>

        {/* Text colors */}
        <div className="flex items-center gap-2 justify-center">
          <Palette className="size-4 text-white/60" />
          {TEXT_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className={`size-6 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-white/30'} transition-transform`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Background colors */}
        <div className="flex items-center gap-2 justify-center">
          <span className="text-white/60 text-[10px] font-medium">BG</span>
          {BG_OPTIONS.map((c) => (
            <button key={c} onClick={() => setBgColor(c)}
              className={`size-6 rounded-full border-2 ${bgColor === c ? 'border-white scale-110' : 'border-white/30'} transition-transform ${c === 'transparent' ? 'bg-[conic-gradient(#fff_0_25%,#ccc_25%_50%,#fff_50%_75%,#ccc_75%)]' : ''}`}
              style={c !== 'transparent' ? { backgroundColor: c } : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StoryTextOverlay;
