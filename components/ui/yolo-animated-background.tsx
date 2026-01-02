import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface YoloAnimatedBackgroundProps {
  breathing?: boolean;
  startingSize?: number;
  breathingRange?: number;
  speed?: number;
  topOffset?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * YoloAnimatedBackground
 * A premium, cool-toned animated background for the YOLO landing page.
 * Uses requestAnimationFrame for a high-performance "breathing" light effect.
 */
export const YoloAnimatedBackground: React.FC<YoloAnimatedBackgroundProps> = ({
  breathing = true,
  startingSize = 35,
  breathingRange = 12,
  speed = 0.0008,
  topOffset = 38,
  className,
  children
}) => {
  const [size, setSize] = useState(startingSize);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const animate = (time: number) => {
    if (!startTimeRef.current) startTimeRef.current = time;
    const elapsed = time - startTimeRef.current;
    
    if (breathing) {
      // Smooth sinusoidal oscillation for the breathing effect
      const newSize = startingSize + Math.sin(elapsed * speed) * breathingRange;
      setSize(newSize);
    }
    
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [breathing, startingSize, breathingRange, speed]);

  return (
    <div 
      className={cn(
        "relative w-full min-h-screen overflow-hidden bg-[#0a0a0c]",
        className
      )}
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% ${topOffset}%, rgba(30, 58, 138, 0.12) 0%, transparent ${size + 25}%),
          radial-gradient(circle at 50% ${topOffset + 4}%, rgba(13, 148, 136, 0.06) 0%, transparent ${size + 10}%),
          radial-gradient(circle at 50% ${topOffset - 2}%, rgba(139, 92, 246, 0.04) 0%, transparent ${size}%)
        `,
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Subtle Vertical Depth Lines */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px)', backgroundSize: '60px 100%' }}>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="relative z-10 w-full min-h-screen"
      >
        {children}
      </motion.div>
      
      {/* Edge Vignette - Graphite based */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(10,10,12,0.8)_100%)]" />
    </div>
  );
};