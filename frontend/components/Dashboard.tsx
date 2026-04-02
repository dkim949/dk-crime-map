"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import { fetchIncidents } from "@/lib/api";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS } from "@/types/incident";

const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

export default function Dashboard() {
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroups, setActiveGroups] = useState<string[]>([]);
  const [district, setDistrict] = useState("");
  const [datePreset, setDatePreset] = useState(0);
  const [lang, setLang] = useState<"de" | "en">("de");
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

  // Client-side filtering: date + category groups
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

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-bg">
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
    <div className="flex min-h-[100dvh] max-md:flex-col-reverse">
      <Sidebar
        incidents={incidents}
        selectedId={selectedId}
        onSelect={handleSelect}
        activeGroups={activeGroups}
        onToggleGroup={toggleGroup}
        onClearGroups={() => setActiveGroups([])}
        district={district}
        datePreset={datePreset}
        lang={lang}
        onDistrictChange={setDistrict}
        onDatePresetChange={setDatePreset}
        onLangChange={setLang}
        loading={loading}
      />
      <main className="flex-1 relative">
        <CrimeMap
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          lang={lang}
        />
      </main>
    </div>
  );
}
