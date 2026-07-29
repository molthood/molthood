import * as React from "react";

import { cn } from "@/lib/utils";

export type SparklineProps = {
  series: number[];
  width?: number;
  height?: number;
  className?: string;
};

/**
 * Minimal trend line. Rendered as a plain SVG path so it costs no chart
 * library and stays identical between server and client.
 */
function Sparkline({ series, width = 72, height = 24, className }: SparklineProps) {
  if (series.length < 2) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  // A flat series would divide by zero; render it down the middle instead.
  const range = max - min || 1;
  const step = width / (series.length - 1);

  const points = series.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export { Sparkline };
