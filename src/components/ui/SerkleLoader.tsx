import React from 'react';

interface SerkleLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  pulse?: boolean;
  showText?: boolean;
}

export const SerkleLoader: React.FC<SerkleLoaderProps> = ({
  size = 'md',
  className = '',
  pulse = true,
  showText = false,
}) => {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-40 h-40',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <img
        src="/lovable-uploads/SerkleSecondaryLogo.svg"
        alt="Loading..."
        className={`${sizeClasses[size]} object-contain ${pulse ? 'heart-pulse' : ''}`}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(113, 58, 32, 0.3))' }}
      />
      {showText && (
        <p className="splash-loading-text text-sm font-semibold tracking-wide">
          Loading
        </p>
      )}
    </div>
  );
};
