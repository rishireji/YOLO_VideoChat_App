"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export function LampContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100vh-64px)] pt-16 flex-col items-center justify-center overflow-hidden bg-zinc-950 w-full rounded-md z-0",
        className
      )}
    >
      {/* 
        Lamp Beams Container: 
        Elevated opacity and adjusted scaling to create a more vibrant, dimensional light source.
      */}
      <div className="relative flex w-full flex-1 scale-y-110 items-center justify-center isolate z-0 pt-40">
        <motion.div
          initial={{ opacity: 0.3, width: "15rem" }}
          whileInView={{ opacity: 0.6, width: "35rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute right-1/2 h-64 w-[35rem] bg-gradient-conic from-red-600 via-transparent to-transparent [--conic-position:from_70deg_at_center_top]"
        />
        <motion.div
          initial={{ opacity: 0.3, width: "15rem" }}
          whileInView={{ opacity: 0.6, width: "35rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className="absolute left-1/2 h-64 w-[35rem] bg-gradient-conic from-transparent via-transparent to-red-600 [--conic-position:from_290deg_at_center_top]"
        />
        
        {/* Softening Atmosphere: Replaced solid masks with gradients for depth */}
        <div className="absolute top-1/2 h-64 w-full bg-zinc-950 blur-3xl" />
        <div className="absolute top-1/2 z-50 h-px w-full bg-transparent opacity-20" />
        <div className="absolute top-0 z-50 h-32 w-full bg-gradient-to-b from-zinc-950 to-transparent" />
        
        {/* Spotlight Falloff: New layer to simulate light bleeding onto the background */}
        <div className="absolute z-10 h-80 w-[40rem] -translate-y-40 bg-red-600/5 blur-[120px] rounded-full" />

        {/* Apex Glow Effects: Intensified to anchor the visual hierarchy */}
        <div className="absolute z-50 h-[2px] w-[30rem] -translate-y-[7rem] bg-red-500/40 blur-sm" />
        <motion.div
          initial={{ width: "8rem", opacity: 0.1 }}
          whileInView={{ width: "20rem", opacity: 0.3 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="absolute z-30 h-44 w-80 -translate-y-[6rem] rounded-full bg-red-500 blur-3xl"
        />
        <motion.div
          initial={{ width: "15rem" }}
          whileInView={{ width: "30rem" }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="absolute z-50 h-px w-[30rem] -translate-y-[7rem] bg-red-400"
        />
      </div>

      {/* 
        Child Content Wrapper: 
        Light source is now positioned to frame the YOLO logo perfectly.
      */}
      <div className="relative z-50 flex flex-col items-center justify-center px-5 pt-8 w-full">
        {children}
      </div>
    </div>
  );
}