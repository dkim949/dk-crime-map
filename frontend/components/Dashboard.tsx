"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import MobileTopBar from "./MobileTopBar";
import MobileList from "./MobileList";
import MapLegend from "./MapLegend";
import IncidentDetail from "./IncidentDetail";
import { fetchIncidents } from "@/lib/api";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS } from "@/types/incident";
import type { Lang } from "@/lib/i18n";

const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

function getInitialParams(): { lang: Lang; days: number; district: string; groups: string[]; bike: boolean } {
  if (typeof window === "undefined") return { lang: "de", days: 0, district: "", groups: [], bike: false };
  const sp = new URLSearchParams(window.location.search);
  return {
    lang: (sp.get("lang") === "en" ? "en" : "de") as Lang,
    days: Number(sp.get("days")) || 0,
    district: sp.get("district") || "",
    groups: sp.get("cat")?.split(",").filter(Boolean) || [],
    bike: sp.get("bike") === "1",
  };
}

export default function Dashboard() {
  const init = useRef(getInitialParams());
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroups, setActiveGroups] = useState<string[]>(init.current.groups);
  const [district, setDistrict] = useState(init.current.district);
  const [datePreset, setDatePreset] = useState(init.current.days);
  const [lang, setLang] = useState<Lang>(init.current.lang);
  const [showBikeLayer, setShowBikeLayer] = useState(init.current.bike);
  const [loading, setLoading] = useState(true);

  // html lang + URL params 동기화
  useEffect(() => {
    document.documentElement.lang = lang;
    const sp = new URLSearchParams();
    if (lang !== "de") sp.set("lang", lang);
    if (datePreset > 0) sp.set("days", String(datePreset));
    if (district) sp.set("district", district);
    if (activeGroups.length > 0) sp.set("cat", activeGroups.join(","));
    if (showBikeLayer) sp.set("bike", "1");
    const qs = sp.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [lang, datePreset, district, activeGroups, showBikeLayer]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (retry = 0) => {
    if (retry === 0) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await fetchIncidents({
        district: district || undefined,
        limit: 500,
      });
      if (result.data.length === 0 && retry < 3) {
        setTimeout(() => load(retry + 1), 5000);
        return;
      }
      setAllIncidents(result.data);
      setLoading(false);
    } catch (e) {
      if (retry < 3) {
        setTimeout(() => load(retry + 1), 5000);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load data");
      setLoading(false);
    }
  }, [district]);

  useEffect(() => {
    load();
  }, [load]);

  const incidents = useMemo(() => {
    let filtered = allIncidents;

    if (datePreset > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - datePreset);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      filtered = filtered.filter((inc) => {
        if (!inc.occurred_at) return false;
        return inc.occurred_at.slice(0, 10) >= cutoffStr;
      });
    }

    if (activeGroups.length > 0) {
      const allowedCategories = activeGroups.flatMap(
        (g) => CATEGORY_GROUPS[g]?.sources || [],
      );
      filtered = filtered.filter((inc) =>
        allowedCategories.includes(inc.category),
      );
    }

    return filtered;
  }, [allIncidents, datePreset, activeGroups]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setActiveGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    );
  }, []);

  const clearGroups = useCallback(() => setActiveGroups([]), []);

  if (error) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-bg">
        <div className="text-center space-y-3">
          <p className="text-accent font-mono text-sm uppercase tracking-widest">
            {error}
          </p>
          <button
            onClick={() => load()}
            className="px-4 py-2 bg-bg-surface border border-border text-fg text-xs font-mono hover:border-accent transition-colors duration-150"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] md:flex-row max-md:flex-col">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          activeGroups={activeGroups}
          onToggleGroup={toggleGroup}
          onClearGroups={clearGroups}
          district={district}
          datePreset={datePreset}
          lang={lang}
          onDistrictChange={setDistrict}
          onDatePresetChange={setDatePreset}
          onLangChange={setLang}
          showBikeLayer={showBikeLayer}
          onToggleBikeLayer={() => setShowBikeLayer((v) => !v)}
          loading={loading}
        />
      </div>

      {/* Mobile top bar */}
      <MobileTopBar
        incidentCount={incidents.length}
        activeGroups={activeGroups}
        onToggleGroup={toggleGroup}
        onClearGroups={clearGroups}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        lang={lang}
        onLangChange={setLang}
        showBikeLayer={showBikeLayer}
        onToggleBikeLayer={() => setShowBikeLayer((v) => !v)}
      />

      {/* Map */}
      <main className="flex-1 relative min-h-0">
        <MapLegend lang={lang} showBikeLayer={showBikeLayer} />
        <CrimeMap
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          lang={lang}
          showBikeLayer={showBikeLayer}
        />
        {selectedId && (
          <IncidentDetail
            incidentId={selectedId}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>

      {/* Mobile incident list */}
      <MobileList
        incidents={incidents}
        selectedId={selectedId}
        onSelect={handleSelect}
        lang={lang}
        loading={loading}
      />
    </div>
  );
}
