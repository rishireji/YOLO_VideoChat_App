
import React from 'react';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  glow?: boolean;
}

export const Brand: React.FC<BrandProps> = ({ size = 'md', className = '', glow = true }) => {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-6xl md:text-8xl',
    xl: 'text-8xl md:text-[14rem]'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4 mx-0.5',
    md: 'w-6 h-6 mx-1',
    lg: 'w-16 h-16 md:w-24 md:h-24 mx-2',
    xl: 'w-24 h-24 md:w-44 md:h-44 mx-2 md:mx-4'
  };

  const LogoIcon = () => (
    <span className={`relative inline-flex items-center justify-center ${iconSizeClasses[size]}`}>
      {/* Outer Rotating Ring */}
      <span className="absolute inset-0 rounded-full border-2 border-red-500/20 border-t-red-500 animate-radar"></span>
      {/* Inner Scanning Ring */}
      <span className="absolute inset-2 rounded-full border border-white/10 border-b-white/40 animate-spin-reverse" style={{ animationDuration: '3s' }}></span>
      {/* The Iris/Pupil */}
      <span className="w-1/3 h-1/3 bg-red-600 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.8)] animate-pulse"></span>
      {/* Technical Brackets */}
      <span className="absolute inset-0 border-t border-l border-red-500/40 w-1/4 h-1/4 -top-1 -left-1"></span>
      <span className="absolute inset-0 border-b border-r border-red-500/40 w-1/4 h-1/4 -bottom-1 -right-1 ml-auto mt-auto"></span>
    </span>
  );

  return (
    <div className={`font-outfit font-bold flex items-center leading-none tracking-tighter select-none ${sizeClasses[size]} ${className} ${glow ? 'drop-shadow-[0_0_20px_rgba(239,68,68,0.15)]' : ''}`}>
      <span className="text-white">Y</span>
      <LogoIcon />
      <span className="text-white">L</span>
      <LogoIcon />
    </div>
  );
};
