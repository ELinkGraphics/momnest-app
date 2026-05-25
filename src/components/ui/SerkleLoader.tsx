import React from 'react';

interface SerkleLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  pulse?: boolean;
}

export const SerkleLoader: React.FC<SerkleLoaderProps> = ({ 
  size = 'md', 
  className = '',
  pulse = true
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <img 
        src="/lovable-uploads/SerkleMainLogo.svg" 
        alt="Loading..." 
        className={`${sizeClasses[size]} object-contain ${pulse ? 'heart-pulse' : ''}`} 
        style={{ filter: 'drop-shadow(0 4px 12px rgba(113, 58, 32, 0.3))' }}
      />
    </div>
  );
};
