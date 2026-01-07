"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { WavyBackground } from "./wavy-background";

export function LampContainer({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <WavyBackground 
      containerClassName={cn("flex flex-col items-center justify-start md:justify-center bg-[#0a0a0c] w-full min-h-screen overflow-y-auto", className)}
      backgroundFill="#0a0a0c"
      blur={10}
      speed="slow"
      waveOpacity={0.6}
    >
      {/* Lamp Beams Container */}
      <div className="relative flex w-full flex-none h-64 items-center justify-center isolate z-0 pt-20">
        <motion.div
          initial={{ opacity: 0.2, width: "15rem" }}
          whileInView={{ opacity: 0.7, width: "30rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute right-1/2 h-56 w-[30rem] bg-gradient-conic from-red-600/60 via-transparent to-transparent [--conic-position:from_70deg_at_center_top]"
        />
        <motion.div
          initial={{ opacity: 0.2, width: "15rem" }}
          whileInView={{ opacity: 0.7, width: "30rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute left-1/2 h-56 w-[30rem] bg-gradient-conic from-transparent via-transparent to-red-600/60 [--conic-position:from_290deg_at_center_top]"
        />
        
        {/* Visual Softening Layers */}
        <div className="absolute top-1/2 h-64 w-full bg-zinc-950/40 blur-3xl" />
        <div className="absolute top-0 z-50 h-32 w-full bg-gradient-to-b from-zinc-950/80 to-transparent" />
        
        {/* Atmospheric Spotlight Bleed */}
        <div className="absolute z-10 h-80 w-[40rem] -translate-y-40 bg-red-600/15 blur-[140px] rounded-full" />

        {/* Apex Glow Elements */}
        <div className="absolute z-50 h-[1px] w-[30rem] -translate-y-[7rem] bg-red-500/60 blur-sm" />
        <motion.div
          initial={{ width: "8rem", opacity: 0.1 }}
          whileInView={{ width: "20rem", opacity: 0.4 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="absolute z-30 h-44 w-80 -translate-y-[6rem] rounded-full bg-orange-500/30 blur-[100px]"
        />
      </div>

      {/* Child Content Wrapper - Removed negative translate offsets */}
      <div className="relative z-50 flex flex-col items-center justify-center px-6 w-full max-w-7xl mx-auto pb-20">
        {children}
      </div>
    </WavyBackground>
  );
}