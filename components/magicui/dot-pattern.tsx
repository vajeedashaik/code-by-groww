"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
}

/** Number of dots that actually twinkle — everything else is a static pattern fill. */
const TWINKLE_COUNT = 20;

/**
 * Ambient dot-grid background. The full grid is a single tiled SVG <pattern>
 * fill (one draw call, GPU-composited) instead of one node per dot — a
 * viewport-sized grid at 24px spacing is 3,000-4,000+ cells, and animating
 * each individually via Framer Motion was the site's main source of jank.
 * A small fixed set of dots gets a real CSS @keyframes animation on top of
 * the static fill to keep the "twinkling" look cheaply.
 */
export function DotPattern({
  width = 24,
  height = 24,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const cols = Math.max(1, Math.ceil(dimensions.width / width));
  const rows = Math.max(1, Math.ceil(dimensions.height / height));

  const twinkleDots = useMemo(() => {
    // Skip on the server and on the first client render (pre-hydration) —
    // Math.random() would pick different values each time and desync from
    // the SSR-ed markup, breaking hydration.
    if (!glow || !mounted) return [];
    const total = cols * rows;
    const count = Math.min(TWINKLE_COUNT, total);
    const picked = new Set<number>();
    while (picked.size < count) {
      picked.add(Math.floor(Math.random() * total));
    }
    return [...picked].map((i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: col * width + cx + x,
        y: row * height + cy + y,
        delay: Math.random() * 5,
        duration: Math.random() * 3 + 2,
      };
    });
    // Only re-pick when the grid actually resizes — a random set is fine to
    // keep across re-renders, it doesn't need to track every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, glow, mounted]);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full text-white/[0.14]", className)}
      {...props}
    >
      <defs>
        <pattern id={`${id}-grid`} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <circle cx={cx} cy={cy} r={cr} fill={glow ? `url(#${id}-gradient)` : "currentColor"} />
        </pattern>
        {glow && (
          <radialGradient id={`${id}-gradient`}>
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-grid)`} />
      {twinkleDots.map((dot) => (
        <circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={cr}
          fill={`url(#${id}-gradient)`}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: `dot-twinkle ${dot.duration}s ease-in-out infinite`,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
    </svg>
  );
}
