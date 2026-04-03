"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import MobileTopBar from "./MobileTopBar";
import MobileList from "./MobileList";
import MapLegend from "./MapLegend";
import IncidentDetail from "./IncidentDetail";
import ReportSheet from "./ReportSheet";
import { fetchIncidents, fetchBikeTheftsAsIncidents, fetchPendingReports } from "@/lib/api";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS } from "@/types/incident";
import { t, type Lang } from "@/lib/i18n";

const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

function getInitialParams(): { lang: Lang; days: number; district: string; groups: string[] } {
  if (typeof window === "undefined") return { lang: "de", days: 0, district: "", groups: [] };
  const sp = new URLSearchParams(window.location.search);
  return {
    lang: (sp.get("lang") === "en" ? "en" : "de") as Lang,
    days: Number(sp.get("days")) || 0,
    district: sp.get("district") || "",
    groups: sp.get("cat")?.split(",").filter(Boolean) || [],
  };
}

export default function Dashboard() {
  const init = useRef(getInitialParams());
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [bikeIncidents, setBikeIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroups, setActiveGroups] = useState<string[]>(init.current.groups);
  const [district, setDistrict] = useState(init.current.district);
  const [datePreset, setDatePreset] = useState(init.current.days);
  const [lang, setLang] = useState<Lang>(init.current.lang);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingReports, setPendingReports] = useState<Incident[]>([]);
  const [reportMode, setReportMode] = useState(false);
  const [reportPin, setReportPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);

  // html lang + URL params sync
  useEffect(() => {
    document.documentElement.lang = lang;
    const sp = new URLSearchParams();
    if (lang !== "de") sp.set("lang", lang);
    if (datePreset > 0) sp.set("days", String(datePreset));
    if (district) sp.set("district", district);
    if (activeGroups.length > 0) sp.set("cat", activeGroups.join(","));
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [lang, datePreset, district, activeGroups]);

  // Load pending reports (separate from main load, best-effort)
  useEffect(() => {
    fetchPendingReports().then(setPendingReports).catch(() => {});
  }, []);

  // Load crime + bike data together
  const load = useCallback(async (retry = 0) => {
    if (retry === 0) {
      setLoading(true);
      setError(null);
    }
    try {
      const [crimeResult, bikeData] = await Promise.all([
        fetchIncidents({ district: district || undefined, limit: 5000 }),
        fetchBikeTheftsAsIncidents(),
      ]);
      if (crimeResult.data.length === 0 && retry < 3) {
        setTimeout(() => load(retry + 1), 5000);
        return;
      }
      setAllIncidents(crimeResult.data);
      setBikeIncidents(bikeData);
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

  // Merge crime + bike, apply filters
  const incidents = useMemo(() => {
    let all = [...allIncidents, ...bikeIncidents];

    if (datePreset > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - datePreset);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      all = all.filter((inc) => {
        if (!inc.occurred_at) return false;
        return inc.occurred_at.slice(0, 10) >= cutoffStr;
      });
    }

    if (activeGroups.length > 0) {
      const allowedCategories = activeGroups.flatMap(
        (g) => CATEGORY_GROUPS[g]?.sources || [],
      );
      all = all.filter((inc) => allowedCategories.includes(inc.category));
    }

    all.sort((a, b) => (b.occurred_at || "").localeCompare(a.occurred_at || ""));
    return all;
  }, [allIncidents, bikeIncidents, datePreset, activeGroups]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  const handleReportPin = useCallback((lat: number, lng: number) => {
    setReportPin({ lat, lng });
    setShowReportSheet(true);
  }, []);

  const handleReportSuccess = useCallback(() => {
    setShowReportSheet(false);
    setReportMode(false);
    setReportPin(null);
    setReportSuccess(true);
    // 신규 신고 반영
    fetchPendingReports().then(setPendingReports).catch(() => {});
    setTimeout(() => setReportSuccess(false), 3000);
  }, []);

  const handleReportClose = useCallback(() => {
    setShowReportSheet(false);
    setReportMode(false);
    setReportPin(null);
  }, []);
  const toggleGroup = useCallback((group: string) => {
    setActiveGroups((prev) => {
      // Radio style: deselect if already the only one (→ All), otherwise select only this
      if (prev.length === 1 && prev[0] === group) return [];
      return [group];
    });
  }, []);
  const clearGroups = useCallback(() => setActiveGroups([]), []);

  if (error) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-bg">
        <div className="text-center space-y-3">
          <p className="text-accent font-mono text-sm uppercase tracking-widest">{error}</p>
          <button onClick={() => load()} className="px-4 py-2 bg-bg-surface border border-border text-fg text-xs font-mono hover:border-accent transition-colors duration-150">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] md:flex-row max-md:flex-col">
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

      <main className="flex-1 relative min-h-0">
        <MapLegend lang={lang} />
        <CrimeMap
          incidents={incidents}
          pendingReports={pendingReports}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDistrictClick={setDistrict}
          lang={lang}
          reportMode={reportMode}
          reportPin={reportPin}
          onReportPin={handleReportPin}
        />

        {/* Report FAB */}
        {!showReportSheet && (
          <button
            onClick={() => { setReportMode(!reportMode); setReportPin(null); }}
            className={`
              absolute bottom-4 right-4 z-[1000] px-3 py-2
              text-[11px] font-mono uppercase tracking-widest border
              transition-all duration-150
              ${reportMode
                ? "bg-accent text-bg border-accent"
                : "bg-bg-raised text-fg-dim border-border hover:text-accent hover:border-accent"
              }
            `}
          >
            {reportMode ? "✕ " : "+ "}{t(lang, "reportBtn")}
          </button>
        )}

        {/* Report mode hint */}
        {reportMode && !showReportSheet && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-raised/90 border border-accent/50 px-3 py-1.5 text-[11px] font-mono text-accent pointer-events-none">
            {t(lang, "reportPlacePin")}
          </div>
        )}

        {/* Success toast */}
        {reportSuccess && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-green-900/90 border border-green-500/50 px-3 py-1.5 text-[11px] font-mono text-green-400 pointer-events-none">
            {t(lang, "reportSuccess")}
          </div>
        )}

        {selectedId && !showReportSheet && (
          <IncidentDetail
            incidentId={selectedId}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        )}

        {showReportSheet && (
          <ReportSheet
            lang={lang}
            pin={reportPin}
            userLocation={userLocation}
            onClose={handleReportClose}
            onSuccess={handleReportSuccess}
          />
        )}
      </main>

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
