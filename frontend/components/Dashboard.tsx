"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import MobileTopBar from "./MobileTopBar";
import MobileList from "./MobileList";
import { fetchIncidents } from "@/lib/api";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS } from "@/types/incident";
import type { Lang } from "@/lib/i18n";

const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

export default function Dashboard() {
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroups, setActiveGroups] = useState<string[]>([]);
  const [district, setDistrict] = useState("");
  const [datePreset, setDatePreset] = useState(0);
  const [lang, setLang] = useState<Lang>("de");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIncidents({
        district: district || undefined,
        limit: 500,
      });
      setAllIncidents(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
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
            onClick={load}
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
      />

      {/* Map */}
      <main className="flex-1 relative min-h-0">
        <CrimeMap
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          lang={lang}
        />
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
