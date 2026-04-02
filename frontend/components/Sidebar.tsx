"use client";

import { useState } from "react";
import type { Incident } from "@/types/incident";
import { CATEGORIES } from "@/types/incident";

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

interface SidebarProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  category: string;
  district: string;
  onCategoryChange: (v: string) => void;
  onDistrictChange: (v: string) => void;
  loading: boolean;
}

export default function Sidebar({
  incidents,
  selectedId,
  onSelect,
  category,
  district,
  onCategoryChange,
  onDistrictChange,
  loading,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const geoCount = incidents.filter((i) => i.lat != null).length;

  return (
    <aside
      className={`
        flex flex-col bg-bg-raised border-r border-border
        transition-[width] duration-200
        ${collapsed ? "w-12" : "w-[380px]"}
        max-md:w-full max-md:h-[45dvh] max-md:border-r-0 max-md:border-t
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">
              Berlin Crime Map
            </h1>
            <p className="text-xs text-fg-muted font-mono tabular-nums">
              {incidents.length} incidents · {geoCount} mapped
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-fg-dim hover:text-fg text-xs font-mono max-md:hidden"
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Filters */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <label className="block">
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                Category
              </span>
              <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="mt-1 w-full bg-bg-surface border border-border text-fg text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="">All</option>
                {Object.entries(CATEGORIES).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] font-mono text-fg-dim uppercase tracking-widest">
                District
              </span>
              <select
                value={district}
                onChange={(e) => onDistrictChange(e.target.value)}
                className="mt-1 w-full bg-bg-surface border border-border text-fg text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="">All</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Incident List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-fg-dim text-xs font-mono">
                Loading...
              </div>
            ) : incidents.length === 0 ? (
              <div className="px-4 py-8 text-center text-fg-dim text-xs font-mono">
                No incidents found
              </div>
            ) : (
              <ul>
                {incidents.map((inc) => (
                  <li
                    key={inc.id}
                    onClick={() => onSelect(inc.id)}
                    className={`
                      px-4 py-2.5 border-b border-border cursor-pointer
                      transition-colors duration-100
                      hover:bg-bg-surface
                      ${selectedId === inc.id ? "bg-bg-surface border-l-2 border-l-accent" : ""}
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1.5 w-2 h-2 shrink-0"
                        style={{
                          background:
                            CATEGORIES[inc.category]?.color || "#71717a",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug truncate">
                          {inc.title_de || "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-fg-dim uppercase">
                            {inc.category}
                          </span>
                          <span className="text-[10px] text-fg-dim">
                            {inc.district || "—"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-fg-dim tabular-nums">
                          {inc.occurred_at
                            ? new Date(inc.occurred_at).toLocaleDateString(
                                "de-DE",
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
