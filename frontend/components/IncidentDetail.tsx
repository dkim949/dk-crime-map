"use client";

import { useEffect, useState } from "react";
import { fetchIncidentDetail } from "@/lib/api";
import type { IncidentDetail as IncidentDetailType } from "@/types/incident";
import { CATEGORY_GROUPS, getCategoryGroup } from "@/types/incident";
import CategoryIcon from "./CategoryIcon";
import type { Lang } from "@/lib/i18n";

interface IncidentDetailProps {
  incidentId: string;
  lang: Lang;
  onClose: () => void;
}

export default function IncidentDetail({ incidentId, lang, onClose }: IncidentDetailProps) {
  const [detail, setDetail] = useState<IncidentDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchIncidentDetail(incidentId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [incidentId]);

  if (loading) {
    return (
      <div className="absolute top-0 right-0 z-[1100] w-[360px] max-md:w-full h-full bg-bg-raised border-l border-border p-4">
        <div className="text-fg-dim text-xs font-mono">Loading...</div>
      </div>
    );
  }

  if (!detail) {
    onClose();
    return null;
  }

  const groupKey = getCategoryGroup(detail.category);
  const group = CATEGORY_GROUPS[groupKey];
  const title = lang === "en" && detail.title_en ? detail.title_en : detail.title_de;

  return (
    <div className="absolute top-0 right-0 z-[1100] w-[360px] max-md:w-full h-full bg-bg-raised border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CategoryIcon shape={group.shape} color={group.color} size={10} glow />
          <span className="text-[11px] font-mono uppercase" style={{ color: group.color }}>
            {group.label[lang]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-fg-dim hover:text-fg text-sm font-mono"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-sm font-bold leading-snug">{title}</h2>

        <div className="space-y-2 text-[11px] font-mono">
          {detail.district && (
            <div className="flex justify-between">
              <span className="text-fg-dim">{lang === "de" ? "Bezirk" : "District"}</span>
              <span>{detail.district}</span>
            </div>
          )}
          {detail.occurred_at && (
            <div className="flex justify-between">
              <span className="text-fg-dim">{lang === "de" ? "Datum" : "Date"}</span>
              <span>{new Date(detail.occurred_at).toLocaleDateString(lang === "de" ? "de-DE" : "en-US")}</span>
            </div>
          )}
          {detail.address_raw && (
            <div className="flex justify-between">
              <span className="text-fg-dim">{lang === "de" ? "Adresse" : "Address"}</span>
              <span className="text-right max-w-[200px]">{detail.address_raw}</span>
            </div>
          )}
        </div>

        {detail.body_de && (
          <div className="border-t border-border pt-3">
            {lang === "en" && (
              <p className="text-[10px] text-fg-dim font-mono mb-2 italic">
                Original report in German:
              </p>
            )}
            <p className="text-xs leading-relaxed text-fg-muted whitespace-pre-line">
              {detail.body_de}
            </p>
          </div>
        )}

        {detail.source_url && (
          <a
            href={detail.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[11px] font-mono text-accent hover:underline"
          >
            {lang === "de" ? "Quelle →" : "Source →"}
          </a>
        )}
      </div>
    </div>
  );
}
