"use client";

import { CATEGORY_GROUPS } from "@/types/incident";
import { t, type Lang } from "@/lib/i18n";
import CategoryIcon from "./CategoryIcon";

const DATE_PRESETS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
] as const;

const GROUP_I18N: Record<string, "violent" | "property" | "other"> = {
  violent: "violent",
  property: "property",
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
  pendingReportsCount?: number;
  showPendingReports?: boolean;
  onTogglePendingReports?: () => void;
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
  pendingReportsCount = 0,
  showPendingReports = false,
  onTogglePendingReports,
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

        {/* User Reports toggle pill */}
        {pendingReportsCount > 0 && (
          <>
            <span className="shrink-0 w-px h-4 bg-border mx-0.5" />
            <button
              onClick={onTogglePendingReports}
              className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-mono border rounded-full transition-colors ${
                showPendingReports
                  ? "border-amber-500/70 text-amber-400 bg-amber-500/10"
                  : "border-border text-fg-dim"
              }`}
            >
              <svg width="8" height="11" viewBox="0 0 24 34" fill="none">
                <circle cx="12" cy="12" r="11" fill={showPendingReports ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="2.5"/>
                <line x1="9" y1="6" x2="9" y2="18" stroke={showPendingReports ? "white" : "#f59e0b"} strokeWidth="2.5" strokeLinecap="round"/>
                <polygon points="9,6 20,9.5 9,13" fill={showPendingReports ? "white" : "#f59e0b"}/>
              </svg>
              {pendingReportsCount}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
