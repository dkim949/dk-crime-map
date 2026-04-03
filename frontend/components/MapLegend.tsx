"use client";

import { CATEGORY_GROUPS } from "@/types/incident";
import CategoryIcon from "./CategoryIcon";
import type { Lang } from "@/lib/i18n";

interface MapLegendProps {
  lang: Lang;
  showBikeLayer: boolean;
}

export default function MapLegend({ lang, showBikeLayer }: MapLegendProps) {
  return (
    <div className="absolute bottom-8 left-3 z-[1000] bg-bg-raised/90 border border-border px-3 py-2 text-[11px] font-mono space-y-1.5 pointer-events-auto">
      {!showBikeLayer ? (
        <>
          <div className="text-fg-dim uppercase tracking-wider text-[9px] mb-1">
            {lang === "de" ? "Kriminalität" : "Crime Density"}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-2">
              {[0.1, 0.2, 0.3, 0.4].map((op, i) => (
                <div key={i} className="w-4 h-2" style={{ background: "#4ade80", opacity: op }} />
              ))}
            </div>
            <span className="text-fg-dim">{lang === "de" ? "wenig → viel" : "low → high"}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {Object.entries(CATEGORY_GROUPS).map(([, { label, color, shape }]) => (
              <div key={label[lang]} className="flex items-center gap-1">
                <CategoryIcon shape={shape} color={color} size={6} />
                <span className="text-fg-dim">{label[lang]}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-fg-dim uppercase tracking-wider text-[9px] mb-1">
            {lang === "de" ? "Fahrraddiebstahl" : "Bike Theft"}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-2">
              {[0.1, 0.2, 0.35, 0.5].map((op, i) => (
                <div key={i} className="w-4 h-2" style={{ background: "#38bdf8", opacity: op }} />
              ))}
            </div>
            <span className="text-fg-dim">{lang === "de" ? "wenig → viel" : "low → high"}</span>
          </div>
        </>
      )}
    </div>
  );
}
