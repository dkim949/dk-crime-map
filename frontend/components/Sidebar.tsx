"use client";

import { useState } from "react";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS, getCategoryGroup } from "@/types/incident";
import { t, type Lang } from "@/lib/i18n";
import CategoryIcon from "./CategoryIcon";

const DISTRICTS = [
  "Mitte",
  "Friedrichshain-Kreuzberg",
  "Pankow",
  "Charlottenburg-Wilmersdorf",
  "Spandau",
  "Steglitz-Zehlendorf",
  "Tempelhof-Schöneberg",
  "Neukölln",
  "Treptow-Köpenick",
  "Marzahn-Hellersdorf",
  "Lichtenberg",
  "Reinickendorf",
];

const DATE_PRESETS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
] as const;

function getTitle(inc: Incident, lang: Lang): string {
  if (lang === "en" && inc.title_en) return inc.title_en;
  return inc.title_de || "—";
}

/** Map group key to i18n key */
const GROUP_I18N: Record<string, "violent" | "property" | "traffic" | "other"> = {
  violent: "violent",
  property: "property",
  traffic: "traffic",
  other: "other",
};

interface SidebarProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeGroups: string[];
  onToggleGroup: (group: string) => void;
  onClearGroups: () => void;
  district: string;
  datePreset: number;
  lang: Lang;
  onDistrictChange: (v: string) => void;
  onDatePresetChange: (days: number) => void;
  onLangChange: (lang: Lang) => void;
  showBikeLayer: boolean;
  onToggleBikeLayer: () => void;
  loading: boolean;
}

export default function Sidebar({
  incidents,
  selectedId,
  onSelect,
  activeGroups,
  onToggleGroup,
  onClearGroups,
  district,
  datePreset,
  lang,
  onDistrictChange,
  onDatePresetChange,
  onLangChange,
  showBikeLayer,
  onToggleBikeLayer,
  loading,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const geoCount = incidents.filter((i) => i.lat != null).length;

  return (
    <aside
      className={`
        flex flex-col bg-bg-raised border-r border-border
        transition-[width] duration-200
        ${collapsed ? "w-12" : "w-[380px]"}
        max-md:w-full max-md:h-[55dvh] max-md:border-r-0 max-md:border-t
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 justify-between">
              <h1 className="text-sm font-bold tracking-tight uppercase text-accent">
                Berlin Crime Map
              </h1>
              <div className="flex text-[10px] font-mono">
                <button
                  onClick={() => onLangChange("de")}
                  className={`px-2 py-0.5 border border-border transition-colors duration-150 ${
                    lang === "de"
                      ? "bg-accent text-bg border-accent"
                      : "text-fg-dim hover:text-fg"
                  }`}
                >
                  DE
                </button>
                <button
                  onClick={() => onLangChange("en")}
                  className={`px-2 py-0.5 border border-l-0 border-border transition-colors duration-150 ${
                    lang === "en"
                      ? "bg-accent text-bg border-accent"
                      : "text-fg-dim hover:text-fg"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
            <p className="text-[11px] text-fg-dim font-mono tabular-nums mt-0.5">
              {incidents.length} {t(lang, "incidents")} · {geoCount} {t(lang, "mapped")}
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-fg-dim hover:text-accent text-xs font-mono max-md:hidden"
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Filters */}
          <div className="border-b border-border">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="w-full px-4 py-2 flex items-center justify-between md:hidden"
            >
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                Filter
              </span>
              <span className="text-fg-dim text-xs">{filtersOpen ? "▲" : "▼"}</span>
            </button>
            <div className={`px-4 pb-3 space-y-2 ${filtersOpen ? "" : "max-md:hidden"} md:pt-3`}>
            {/* Period */}
            <div>
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                {t(lang, "period")}
              </span>
              <div className="mt-1 flex">
                {DATE_PRESETS.map(({ label, days }) => (
                  <button
                    key={label}
                    onClick={() => onDatePresetChange(days)}
                    className={`
                      flex-1 py-1.5 text-xs font-mono border border-border
                      transition-colors duration-150
                      ${datePreset === days
                        ? "bg-accent text-bg border-accent"
                        : "bg-bg-surface text-fg-muted hover:text-fg hover:border-border-bright"
                      }
                    `}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => onDatePresetChange(0)}
                  className={`
                    flex-1 py-1.5 text-xs font-mono border border-border
                    transition-colors duration-150
                    ${datePreset === 0
                      ? "bg-accent text-bg border-accent"
                      : "bg-bg-surface text-fg-muted hover:text-fg hover:border-border-bright"
                    }
                  `}
                >
                  {t(lang, "all")}
                </button>
              </div>
            </div>

            {/* Category groups */}
            <div>
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                {t(lang, "category")}
              </span>
              <div className="mt-1 flex gap-1.5">
                {Object.entries(CATEGORY_GROUPS).map(
                  ([key, { color, shape }]) => {
                    const active =
                      activeGroups.length === 0 || activeGroups.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => onToggleGroup(key)}
                        className={`
                          flex-1 flex items-center justify-center gap-1.5
                          py-2 text-[10px] font-mono border
                          transition-all duration-150
                          ${activeGroups.includes(key)
                            ? "border-current"
                            : "text-fg-dim border-border hover:text-fg hover:border-border-bright"
                          }
                        `}
                        style={
                          activeGroups.includes(key)
                            ? {
                                borderColor: color,
                                color,
                                background: `${color}12`,
                                boxShadow: `0 0 10px ${color}20`,
                              }
                            : {}
                        }
                      >
                        <CategoryIcon
                          shape={shape}
                          color={active ? color : "#4b5563"}
                          size={8}
                        />
                        {t(lang, GROUP_I18N[key])}
                      </button>
                    );
                  },
                )}
                <button
                  onClick={() => onClearGroups()}
                  className={`
                    flex-1 flex items-center justify-center
                    py-2 text-[10px] font-mono border
                    transition-all duration-150
                    ${activeGroups.length === 0
                      ? "bg-accent text-bg border-accent"
                      : "text-fg-dim border-border hover:text-fg hover:border-border-bright"
                    }
                  `}
                >
                  {t(lang, "all")}
                </button>
              </div>
            </div>

            {/* District */}
            <label className="block">
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                {t(lang, "district")}
              </span>
              <select
                value={district}
                onChange={(e) => onDistrictChange(e.target.value)}
                className="mt-1 w-full bg-bg-surface border border-border text-fg text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="">{t(lang, "all")}</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            {/* Bike theft layer toggle */}
            <button
              onClick={onToggleBikeLayer}
              className={`w-full flex items-center justify-between py-2 px-2 text-[10px] font-mono border transition-all duration-150 ${
                showBikeLayer
                  ? "border-[#fbbf24] text-[#fbbf24]"
                  : "border-border text-fg-dim hover:text-fg hover:border-border-bright"
              }`}
              style={showBikeLayer ? { background: "#fbbf2412", boxShadow: "0 0 10px #fbbf2420" } : {}}
            >
              <span>🚲 {lang === "de" ? "Fahrraddiebstahl" : "Bike Theft"}</span>
              <span>{showBikeLayer ? "ON" : "OFF"}</span>
            </button>
            </div>
          </div>

          {/* Incident List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-fg-dim text-xs font-mono">
                {t(lang, "loading")}
              </div>
            ) : incidents.length === 0 ? (
              <div className="px-4 py-8 text-center text-fg-dim text-xs font-mono">
                {t(lang, "noIncidents")}
              </div>
            ) : (
              <ul>
                {incidents.map((inc) => {
                  const groupKey = getCategoryGroup(inc.category);
                  const group = CATEGORY_GROUPS[groupKey];
                  return (
                    <li
                      key={inc.id}
                      onClick={() => onSelect(inc.id)}
                      className={`
                        px-4 py-2.5 border-b border-border cursor-pointer
                        transition-colors duration-150
                        hover:bg-bg-surface
                        ${selectedId === inc.id ? "bg-bg-surface" : ""}
                      `}
                      style={
                        selectedId === inc.id
                          ? { borderLeft: `2px solid ${group.color}` }
                          : {}
                      }
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1.5 shrink-0 flex items-center justify-center w-4 h-4">
                          <CategoryIcon
                            shape={group.shape}
                            color={group.color}
                            size={8}
                            glow
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-snug truncate">
                            {getTitle(inc, lang)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className="text-[10px] font-mono uppercase"
                              style={{ color: group.color }}
                            >
                              {group.label[lang]}
                            </span>
                            <span className="text-[10px] text-fg-dim">
                              {inc.district || "—"}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-fg-dim tabular-nums">
                            {inc.occurred_at
                              ? new Date(inc.occurred_at).toLocaleDateString(
                                  lang === "de" ? "de-DE" : "en-US",
                                )
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
