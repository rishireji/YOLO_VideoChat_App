
"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { WavyBackground } from "./wavy-background";

// Fixed: Make children prop optional to resolve TS error: Property 'children' is missing in type '{ className: string; }'
export function LampContainer({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <WavyBackground 
      containerClassName={cn("min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c]", className)}
      backgroundFill="#0a0a0c"
      blur={12}
      speed="slow"
      waveOpacity={0.4}
    >
      {/* 
        Lamp Beams Container: 
        Reduced vertical padding to shift the glow focal point higher.
      */}
      <div className="relative flex w-full flex-1 scale-y-105 items-center justify-center isolate z-0 pt-16 md:pt-24">
        <motion.div
          initial={{ opacity: 0.1, width: "15rem" }}
          whileInView={{ opacity: 0.3, width: "35rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute right-1/2 h-48 md:h-64 w-[35rem] bg-gradient-conic from-indigo-600/20 via-transparent to-transparent [--conic-position:from_70deg_at_center_top]"
        />
        <motion.div
          initial={{ opacity: 0.1, width: "15rem" }}
          whileInView={{ opacity: 0.3, width: "35rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute left-1/2 h-48 md:h-64 w-[35rem] bg-gradient-conic from-transparent via-transparent to-indigo-600/20 [--conic-position:from_290deg_at_center_top]"
        />
        
        {/* Visual Softening Layers */}
        <div className="absolute top-1/2 h-64 w-full bg-zinc-950/20 blur-3xl" />
        <div className="absolute top-1/2 z-50 h-px w-full bg-transparent opacity-10" />
        <div className="absolute top-0 z-50 h-32 w-full bg-gradient-to-b from-zinc-950/60 to-transparent" />
        
        {/* Atmospheric Spotlight Bleed */}
        <div className="absolute z-10 h-80 w-[40rem] -translate-y-40 bg-indigo-600/5 blur-[140px] rounded-full" />

        {/* Apex Glow Elements */}
        <div className="absolute z-50 h-[1px] w-[30rem] -translate-y-[7rem] bg-indigo-500/20 blur-sm" />
        <motion.div
          initial={{ width: "8rem", opacity: 0.05 }}
          whileInView={{ width: "20rem", opacity: 0.12 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="absolute z-30 h-44 w-80 -translate-y-[6rem] rounded-full bg-teal-500 blur-[120px]"
        />
        <motion.div
          initial={{ width: "15rem" }}
          whileInView={{ width: "30rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="absolute z-50 h-px w-[30rem] -translate-y-[7rem] bg-indigo-400/20"
        />
      </div>

      {/* 
        Child Content Wrapper: 
        Reduced top padding significantly to remove excessive whitespace above the heading.
      */}
      <div className="relative z-50 flex flex-col items-center justify-center px-6 pt-4 md:pt-6 pb-12 w-full">
        {children}
      </div>
    </WavyBackground>
  );
}
