"use client";

import { CATEGORY_GROUPS } from "@/types/incident";
import CategoryIcon from "./CategoryIcon";
import type { Lang } from "@/lib/i18n";

interface MapLegendProps {
  lang: Lang;
}

export default function MapLegend({ lang }: MapLegendProps) {
  return (
    <div className="absolute bottom-8 left-3 z-[1000] bg-bg-raised/90 border border-border px-3 py-2 text-[11px] font-mono space-y-1.5 pointer-events-auto">
      <div className="text-fg-dim uppercase tracking-wider text-[9px]">
        {lang === "de" ? "Kriminalität" : "Crime Density"}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-2">
          {[0.1, 0.2, 0.3, 0.45].map((op, i) => (
            <div key={i} className="w-3 h-2" style={{ background: "#4ade80", opacity: op }} />
          ))}
        </div>
        <div className="flex gap-x-2">
          {Object.entries(CATEGORY_GROUPS).map(([, { label, color, shape }]) => (
            <span key={label[lang]} className="flex items-center gap-0.5">
              <CategoryIcon shape={shape} color={color} size={5} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
