import React from 'react';

interface ProgressBarConfig {
  isCurrent: boolean;
  isComplete: boolean;
}

interface StoryProgressBarProps {
  config: ProgressBarConfig[];
  progress: number;
}

export const StoryProgressBar: React.FC<StoryProgressBarProps> = ({ config, progress }) => {
  return (
    <div className="absolute top-3 left-3 right-3 flex gap-[3px] z-20">
      {config.map((bar, index) => (
        <div key={index} className="story-progress-track">
          <div
            className="story-progress-fill"
            style={{
              transform: `scaleX(${bar.isComplete ? 1 : bar.isCurrent ? progress / 100 : 0})`,
              transition: bar.isCurrent ? 'none' : 'none',
              transformOrigin: 'left',
              width: '100%',
            }}
          />
        </div>
      ))}
    </div>
  );
};
