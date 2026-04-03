"use client";

import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS, getCategoryGroup } from "@/types/incident";
import { t, type Lang } from "@/lib/i18n";
import CategoryIcon from "./CategoryIcon";

function getTitle(inc: Incident, lang: Lang): string {
  if (lang === "en" && inc.title_en) return inc.title_en;
  return inc.title_de || "—";
}

interface MobileListProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Lang;
  loading: boolean;
}

export default function MobileList({
  incidents,
  selectedId,
  onSelect,
  lang,
  loading,
}: MobileListProps) {
  return (
    <div className="md:hidden h-[25dvh] bg-bg-raised border-t border-border overflow-y-auto">
      {loading ? (
        <div className="py-6 text-center text-fg-dim text-xs font-mono">
          {t(lang, "loading")}
        </div>
      ) : incidents.length === 0 ? (
        <div className="py-6 text-center text-fg-dim text-xs font-mono">
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
                  px-3 py-2 border-b border-border cursor-pointer
                  transition-colors duration-150
                  active:bg-bg-surface
                  ${selectedId === inc.id ? "bg-bg-surface" : ""}
                `}
                style={
                  selectedId === inc.id
                    ? { borderLeft: `2px solid ${group.color}` }
                    : {}
                }
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon
                    shape={group.shape}
                    color={group.color}
                    size={8}
                    glow
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug truncate">
                      {getTitle(inc, lang)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-mono uppercase"
                        style={{ color: group.color }}
                      >
                        {group.label[lang]}
                      </span>
                      <span className="text-[11px] text-fg-dim">
                        {inc.district || "—"}
                      </span>
                      <span className="text-[11px] font-mono text-fg-dim tabular-nums ml-auto">
                        {inc.occurred_at
                          ? new Date(inc.occurred_at).toLocaleDateString(
                              lang === "de" ? "de-DE" : "en-US",
                              { day: "numeric", month: "short" },
                            )
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
