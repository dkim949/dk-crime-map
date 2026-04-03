"use client";

import { CATEGORY_GROUPS } from "@/types/incident";
import { t, type Lang } from "@/lib/i18n";
import CategoryIcon from "./CategoryIcon";

const DATE_PRESETS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
] as const;

const GROUP_I18N: Record<string, "violent" | "property" | "traffic" | "other"> = {
  violent: "violent",
  property: "property",
  traffic: "traffic",
  other: "other",
};

interface MobileTopBarProps {
  incidentCount: number;
  activeGroups: string[];
  onToggleGroup: (group: string) => void;
  onClearGroups: () => void;
  datePreset: number;
  onDatePresetChange: (days: number) => void;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  showBikeLayer: boolean;
  onToggleBikeLayer: () => void;
}

export default function MobileTopBar({
  incidentCount,
  activeGroups,
  onToggleGroup,
  onClearGroups,
  datePreset,
  onDatePresetChange,
  lang,
  onLangChange,
  showBikeLayer,
  onToggleBikeLayer,
}: MobileTopBarProps) {
  return (
    <div className="md:hidden bg-bg-raised border-b border-border">
      {/* Row 1: Title + Lang + Count */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xs font-bold tracking-tight uppercase text-accent">
            Berlin Crime Map
          </h1>
          <span className="text-[11px] text-fg-dim font-mono tabular-nums">
            {incidentCount}
          </span>
        </div>
        <div className="flex text-[11px] font-mono">
          <button
            onClick={() => onLangChange("de")}
            className={`px-2 py-0.5 border border-border ${
              lang === "de" ? "bg-accent text-bg border-accent" : "text-fg-dim"
            }`}
          >
            DE
          </button>
          <button
            onClick={() => onLangChange("en")}
            className={`px-2 py-0.5 border border-l-0 border-border ${
              lang === "en" ? "bg-accent text-bg border-accent" : "text-fg-dim"
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* Row 2: Period + Categories inline */}
      <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto">
        {/* Period */}
        {DATE_PRESETS.map(({ label, days }) => (
          <button
            key={label}
            onClick={() => onDatePresetChange(days)}
            className={`shrink-0 px-2.5 py-1 text-[11px] font-mono border border-border rounded-full transition-colors ${
              datePreset === days
                ? "bg-accent text-bg border-accent"
                : "text-fg-dim"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => onDatePresetChange(0)}
          className={`shrink-0 px-2.5 py-1 text-[11px] font-mono border border-border rounded-full transition-colors ${
            datePreset === 0
              ? "bg-accent text-bg border-accent"
              : "text-fg-dim"
          }`}
        >
          {t(lang, "all")}
        </button>

        <span className="shrink-0 w-px h-4 bg-border mx-0.5" />

        {/* Bike layer */}
        <button
          onClick={onToggleBikeLayer}
          className={`shrink-0 px-2.5 py-1 text-[11px] font-mono border rounded-full transition-colors ${
            showBikeLayer ? "border-[#fbbf24] text-[#fbbf24]" : "border-border text-fg-dim"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h3"/>
          </svg>
          {lang === "de" ? "Rad" : "Bike"}
        </button>

        <span className="shrink-0 w-px h-4 bg-border mx-0.5" />

        {/* Categories */}
        {Object.entries(CATEGORY_GROUPS).map(([key, { color, shape }]) => {
          const selected = activeGroups.includes(key);
          return (
            <button
              key={key}
              onClick={() => onToggleGroup(key)}
              className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-mono border rounded-full transition-colors ${
                selected ? "border-current" : "border-border text-fg-dim"
              }`}
              style={selected ? { borderColor: color, color } : {}}
            >
              <CategoryIcon
                shape={shape}
                color={selected || activeGroups.length === 0 ? color : "#4b5563"}
                size={6}
              />
              {t(lang, GROUP_I18N[key])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
