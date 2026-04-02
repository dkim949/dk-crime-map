"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import { fetchIncidents } from "@/lib/api";
import type { Incident } from "@/types/incident";

const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIncidents({
        category: category || undefined,
        district: district || undefined,
        limit: 500,
      });
      setIncidents(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [category, district]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-bg">
        <div className="text-center space-y-3">
          <p className="text-accent font-mono text-sm uppercase tracking-widest">
            Connection Error
          </p>
          <p className="text-fg-dim text-xs font-mono max-w-xs">{error}</p>
          <button
            onClick={load}
            className="px-4 py-2 bg-bg-surface border border-border text-fg text-xs font-mono hover:bg-bg-raised transition-colors duration-100"
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
        category={category}
        district={district}
        onCategoryChange={setCategory}
        onDistrictChange={setDistrict}
        loading={loading}
      />
      <main className="flex-1 relative">
        <CrimeMap
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </main>
    </div>
  );
}
