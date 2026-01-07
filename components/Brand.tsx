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
    lg: 'text-6xl md:text-9xl',
    xl: 'text-8xl md:text-[14rem]'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4 mx-0.5',
    md: 'w-6 h-6 mx-1',
    lg: 'w-12 h-12 md:w-28 md:h-28 mx-3 md:mx-4',
    xl: 'w-24 h-24 md:w-48 md:h-48 mx-4 md:mx-6'
  };

  const LogoIcon = () => (
    <span className={`relative inline-flex items-center justify-center ${iconSizeClasses[size]}`}>
      {/* Outer Rotating Ring */}
      <span className="absolute inset-0 rounded-full border-2 border-red-500/40 border-t-red-500 animate-radar"></span>
      {/* Inner Scanning Ring */}
      <span className="absolute inset-2 rounded-full border border-white/20 border-b-white/60 animate-spin-reverse" style={{ animationDuration: '3s' }}></span>
      
      {/* The Iris/Pupil - Enhanced with gradient and stronger glow */}
      <span className="w-1/2 h-1/2 rounded-full bg-gradient-to-br from-red-600 via-red-500 to-orange-400 shadow-[0_0_35px_rgba(239,68,68,0.9)] animate-pulse"></span>
      
      {/* Technical Brackets */}
      <span className="absolute inset-0 border-t-2 border-l-2 border-red-500/60 w-1/4 h-1/4 -top-1 -left-1"></span>
      <span className="absolute inset-0 border-b-2 border-r-2 border-red-500/60 w-1/4 h-1/4 -bottom-1 -right-1 ml-auto mt-auto"></span>
    </span>
  );

  return (
    <div className={`font-outfit font-black flex items-center leading-none tracking-tighter select-none ${sizeClasses[size]} ${className} ${glow ? 'drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]' : ''}`}>
      <span className="text-white">Y</span>
      <LogoIcon />
      <span className="text-white">L</span>
      <LogoIcon />
    </div>
  );
};