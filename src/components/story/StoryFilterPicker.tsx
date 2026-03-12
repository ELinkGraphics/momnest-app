import React from 'react';
import { X } from 'lucide-react';

export interface StoryFilter {
  id: string;
  name: string;
  css: string;
}

export const STORY_FILTERS: StoryFilter[] = [
  { id: 'none', name: 'Normal', css: 'none' },
  { id: 'grayscale', name: 'B&W', css: 'grayscale(100%)' },
  { id: 'sepia', name: 'Sepia', css: 'sepia(80%)' },
  { id: 'warm', name: 'Warm', css: 'saturate(1.4) hue-rotate(-10deg) brightness(1.05)' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.9) hue-rotate(20deg) brightness(1.05)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(30%) contrast(1.1) brightness(0.95) saturate(1.2)' },
  { id: 'dramatic', name: 'Drama', css: 'contrast(1.4) brightness(0.9) saturate(1.1)' },
  { id: 'bright', name: 'Bright', css: 'brightness(1.2) saturate(1.1)' },
  { id: 'fade', name: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(100%) contrast(1.3) brightness(0.9)' },
  { id: 'bloom', name: 'Bloom', css: 'brightness(1.15) saturate(1.3) contrast(0.95)' },
];

interface Props {
  previewUrl: string;
  selected: string;
  onSelect: (filterId: string) => void;
  onClose: () => void;
}

const StoryFilterPicker: React.FC<Props> = ({ previewUrl, selected, onSelect, onClose }) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/80 backdrop-blur-sm rounded-t-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <h3 className="text-white font-semibold">Filters</h3>
        <button onClick={onClose} className="p-1.5 rounded-full bg-card/10 text-white">
          <X className="size-4" />
        </button>
      </div>

      {/* Filter strip */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-4 scrollbar-hide">
        {STORY_FILTERS.map((filter) => (
          <button key={filter.id} onClick={() => onSelect(filter.id)}
            className={`flex flex-col items-center gap-1.5 shrink-0 transition-transform ${selected === filter.id ? 'scale-105' : ''}`}>
            <div className={`size-16 rounded-xl overflow-hidden border-2 transition-colors ${selected === filter.id ? 'border-primary' : 'border-transparent'}`}>
              <img
                src={previewUrl}
                alt={filter.name}
                className="w-full h-full object-cover"
                style={{ filter: filter.css }}
              />
            </div>
            <span className={`text-[10px] font-medium ${selected === filter.id ? 'text-primary' : 'text-white/70'}`}>
              {filter.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default StoryFilterPicker;
