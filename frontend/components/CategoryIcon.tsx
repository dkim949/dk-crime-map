"use client";

import type { CategoryGroup } from "@/types/incident";

interface CategoryIconProps {
  shape: CategoryGroup["shape"];
  color: string;
  size?: number;
  glow?: boolean;
}

/** Small geometric shape icon for crime category groups. */
export default function CategoryIcon({
  shape,
  color,
  size = 10,
  glow = false,
}: CategoryIconProps) {
  const shadow = glow ? `0 0 6px ${color}80` : "none";

  if (shape === "triangle") {
    return (
      <span
        style={{
          display: "inline-block",
          width: 0,
          height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid ${color}`,
          filter: glow ? `drop-shadow(0 0 4px ${color}80)` : "none",
        }}
      />
    );
  }

  if (shape === "diamond") {
    return (
      <span
        style={{
          display: "inline-block",
          width: size * 0.7,
          height: size * 0.7,
          background: color,
          transform: "rotate(45deg)",
          boxShadow: shadow,
        }}
      />
    );
  }

  if (shape === "circle") {
    return (
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          background: color,
          borderRadius: "50%",
          boxShadow: shadow,
        }}
      />
    );
  }

  // square
  return (
    <span
      style={{
        display: "inline-block",
        width: size * 0.8,
        height: size * 0.8,
        background: color,
        boxShadow: shadow,
      }}
    />
  );
}
