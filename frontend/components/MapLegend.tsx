"use client";

import { CATEGORY_GROUPS } from "@/types/incident";
import CategoryIcon from "./CategoryIcon";
import type { Lang } from "@/lib/i18n";

const COLOR_SCALE = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

interface MapLegendProps {
  lang: Lang;
}

export default function MapLegend({ lang }: MapLegendProps) {
  return (
    <div className="absolute bottom-8 left-3 z-[1000] bg-bg-raised/90 border border-border px-3 py-2 text-[11px] font-mono space-y-1.5 pointer-events-auto">
      <div className="flex items-center gap-2">
        <span className="text-fg-dim text-[9px]">{lang === "de" ? "sicher" : "safe"}</span>
        <div className="flex h-2.5">
          {COLOR_SCALE.map((c, i) => (
            <div key={i} className="w-4 h-2.5" style={{ background: c, opacity: 0.7 }} />
          ))}
        </div>
        <span className="text-fg-dim text-[9px]">{lang === "de" ? "gefährlich" : "danger"}</span>
      </div>
      <div className="flex gap-x-2">
        {Object.entries(CATEGORY_GROUPS).map(([, { label, color, shape }]) => (
          <span key={label[lang]} className="flex items-center gap-0.5">
            <CategoryIcon shape={shape} color={color} size={5} />
            <span className="text-fg-dim text-[9px]">{label[lang]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
