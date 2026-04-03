"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import type { Incident } from "@/types/incident";
import { CATEGORY_GROUPS, getCategoryGroup, getCategoryColor } from "@/types/incident";
// Bike thefts are merged into incidents — no separate layer needed

const BERLIN_CENTER: [number, number] = [52.52, 13.405];
const DEFAULT_ZOOM = 11;
const MARKER_VISIBLE_ZOOM = 13;
const MARKER_SIZE = 10;
const CHOROPLETH_BORDER = "#1e293b";
const CHOROPLETH_OPACITY = 0.5;
// Green(safe) → Yellow → Orange → Red(danger)
const COLOR_SCALE = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
}

function markerSvg(category: string): string {
  const group = getCategoryGroup(category);
  const g = CATEGORY_GROUPS[group];
  const color = g.color;
  const s = MARKER_SIZE;
  switch (g.shape) {
    case "triangle":
      return `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><polygon points="5,0 0,10 10,10" fill="${color}" opacity="0.9"/></svg>`;
    case "diamond":
      return `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><polygon points="5,0 10,5 5,10 0,5" fill="${color}" opacity="0.9"/></svg>`;
    case "circle":
      return `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${color}" opacity="0.9"/></svg>`;
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="${color}" opacity="0.9"/></svg>`;
  }
}

function createMarkerIcon(category: string): L.DivIcon {
  const color = getCategoryColor(category);
  return L.divIcon({
    className: "",
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    html: `<div style="filter:drop-shadow(0 0 4px ${color}aa)">${markerSvg(category)}</div>`,
  });
}

// 깃발 아이콘 — 유저 신고 전용
const FLAG_COLOR = "#f59e0b"; // amber
function createFlagIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [14, 20],
    iconAnchor: [2, 20],
    html: `<div style="filter:drop-shadow(0 0 4px ${FLAG_COLOR}88)">
      <svg width="14" height="20" viewBox="0 0 14 20">
        <line x1="2" y1="0" x2="2" y2="19" stroke="${FLAG_COLOR}" stroke-width="1.5" stroke-linecap="round"/>
        <polygon points="2,1 13,5 2,10" fill="${FLAG_COLOR}" opacity="0.9"/>
      </svg>
    </div>`,
  });
}

function countByDistrict(incidents: Incident[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const inc of incidents) {
    if (!inc.district) continue;
    counts[inc.district.trim()] = (counts[inc.district.trim()] || 0) + 1;
  }
  return counts;
}

function matchDistrictName(geoName: string, districtCounts: Record<string, number>): number {
  if (districtCounts[geoName] != null) return districtCounts[geoName];
  const lower = geoName.toLowerCase();
  for (const [key, count] of Object.entries(districtCounts)) {
    if (key.toLowerCase() === lower) return count;
  }
  for (const [key, count] of Object.entries(districtCounts)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return count;
  }
  return 0;
}

// Quantile-based: rank within the current filtered dataset, so color spread is always even
function getHeatColor(count: number, sortedCounts: number[]): string {
  if (count === 0 || sortedCounts.length === 0) return COLOR_SCALE[0];
  const rank = sortedCounts.findIndex(c => c >= count);
  const safeRank = rank === -1 ? sortedCounts.length - 1 : rank;
  const ratio = sortedCounts.length <= 1 ? 1 : safeRank / (sortedCounts.length - 1);
  const idx = Math.min(Math.floor(ratio * COLOR_SCALE.length), COLOR_SCALE.length - 1);
  return COLOR_SCALE[idx];
}

function getTitle(inc: Incident, lang: "de" | "en"): string {
  if (lang === "en" && inc.title_en) return inc.title_en;
  return inc.title_de || "—";
}

interface CrimeMapProps {
  incidents: Incident[];
  pendingReports?: Incident[];
  showPendingReports?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDistrictClick?: (district: string) => void;
  lang: "de" | "en";
  reportMode?: boolean;
  reportPin?: { lat: number; lng: number } | null;
  onReportPin?: (lat: number, lng: number) => void;
}

export default function CrimeMap({
  incidents,
  pendingReports = [],
  showPendingReports = false,
  selectedId,
  onSelect,
  onDistrictClick,
  lang,
  reportMode = false,
  reportPin = null,
  onReportPin,
}: CrimeMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const flagMarkersRef = useRef<L.LayerGroup | null>(null);  // 유저 신고 전용 — 항상 표시
  const choroplethRef = useRef<L.GeoJSON | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const locateMarkerRef = useRef<L.Marker | null>(null);
  const reportPinMarkerRef = useRef<L.Marker | null>(null);
  const [geoData, setGeoData] = useState<GeoJsonCollection | null>(null);
  const [markersVisible, setMarkersVisible] = useState(DEFAULT_ZOOM >= MARKER_VISIBLE_ZOOM);

  useEffect(() => {
    fetch("/berlin-bezirke.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch((e) => console.error("Failed to load GeoJSON:", e));
  }, []);

  const handleZoom = useCallback(() => {
    if (!mapRef.current) return;
    setMarkersVisible(mapRef.current.getZoom() >= MARKER_VISIBLE_ZOOM);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    flagMarkersRef.current = L.layerGroup().addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("zoomend", handleZoom);
    return () => { map.off("zoomend", handleZoom); map.remove(); mapRef.current = null; };
  }, [handleZoom]);

  // Report mode: map click → place pin
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (reportMode && onReportPin) {
      map.getContainer().style.cursor = "crosshair";
      const handler = (e: L.LeafletMouseEvent) => onReportPin(e.latlng.lat, e.latlng.lng);
      map.on("click", handler);
      return () => { map.off("click", handler); map.getContainer().style.cursor = ""; };
    } else {
      map.getContainer().style.cursor = "";
    }
  }, [reportMode, onReportPin]);

  // Report pin marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (reportPinMarkerRef.current) { reportPinMarkerRef.current.remove(); reportPinMarkerRef.current = null; }
    if (!reportPin) return;
    reportPinMarkerRef.current = L.marker([reportPin.lat, reportPin.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;background:#e0115f;border-radius:50%;border:2px solid #fff;box-shadow:0 0 12px #e0115f99;transform:translate(-50%,-50%)"></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
    }).addTo(mapRef.current);
  }, [reportPin]);

  // Crime choropleth (Bezirk level) — bike layer ON이면 숨김
  useEffect(() => {
    if (!mapRef.current || !geoData) return;
    if (choroplethRef.current) { choroplethRef.current.remove(); choroplethRef.current = null; }
    if (labelsRef.current) labelsRef.current.clearLayers();

    const districtCounts = countByDistrict(incidents);
    const sortedCounts = Object.values(districtCounts).filter(c => c > 0).sort((a, b) => a - b);

    const choropleth = L.geoJSON(geoData as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const name = feature?.properties?.name || "";
        const count = matchDistrictName(name, districtCounts);
        const color = getHeatColor(count, sortedCounts);
        return {
          fillColor: color,
          fillOpacity: count > 0 ? CHOROPLETH_OPACITY : 0.05,
          color: CHOROPLETH_BORDER,
          weight: 1,
          opacity: 0.6,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || "";
        const count = matchDistrictName(name, districtCounts);
        const heatColor = getHeatColor(count, sortedCounts);
        layer.bindTooltip(
          `<div style="font-family:var(--font-mono),monospace;font-size:12px;padding:6px 10px;background:#12121aee;color:#e4e4e7;border:1px solid ${heatColor}44;">
            <span style="font-weight:700;color:${heatColor}">${name}</span>
            <span style="color:#9ca3af;margin-left:6px">${count}</span>
          </div>`,
          { sticky: true, direction: "top", offset: [0, -10], className: "choropleth-tooltip" },
        );
        layer.on("mouseover", () => {
          (layer as L.Path).setStyle({ weight: 2, color: `${heatColor}88`, fillOpacity: Math.min(CHOROPLETH_OPACITY + 0.15, 0.7) });
        });
        layer.on("mouseout", () => choropleth.resetStyle(layer));
        layer.on("click", () => { if (!reportMode) onDistrictClick?.(name); });
      },
    });
    choropleth.addTo(mapRef.current);
    choropleth.bringToBack();
    choroplethRef.current = choropleth;

    // District count labels
    if (labelsRef.current) labelsRef.current.clearLayers();
    choropleth.eachLayer((layer) => {
      const feature = (layer as unknown as { feature?: GeoJSON.Feature }).feature;
      if (!feature) return;
      const name = feature.properties?.name || "";
      const count = matchDistrictName(name, districtCounts);
      if (count === 0) return;
      const center = (layer as L.Polygon).getBounds().getCenter();
      L.marker(center, {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-family:var(--font-mono),monospace;font-size:13px;font-weight:700;color:#e4e4e7;text-shadow:0 0 8px #0a0a0f,0 0 4px #0a0a0f;text-align:center;white-space:nowrap">${count}</div>`,
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        }),
        interactive: false,
      }).addTo(labelsRef.current!);
    });

    return () => {
      if (choroplethRef.current) { choroplethRef.current.remove(); choroplethRef.current = null; }
      if (labelsRef.current) labelsRef.current.clearLayers();
    };
  }, [geoData, incidents, onDistrictClick, reportMode]);

  // Markers
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();
    if (!markersVisible) return;

    // 공식 사건 마커
    incidents.forEach((inc) => {
      if (inc.lat == null || inc.lng == null) return;
      const group = CATEGORY_GROUPS[getCategoryGroup(inc.category)];
      const marker = L.marker([inc.lat, inc.lng], { icon: createMarkerIcon(inc.category) });
      marker.bindPopup(
        `<div style="font-family:var(--font-mono),monospace;font-size:12px;min-width:200px">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px;color:#e4e4e7">${getTitle(inc, lang)}</div>
          <div style="color:${group.color};margin-bottom:2px;text-transform:uppercase;font-size:10px">${group.label[lang]}</div>
          <div style="color:#9ca3af;margin-bottom:2px">${inc.district || "—"}</div>
          <div style="color:#4b5563;font-size:11px">${inc.occurred_at ? new Date(inc.occurred_at).toLocaleDateString(lang === "de" ? "de-DE" : "en-US") : "—"}</div>
        </div>`,
      );
      marker.on("click", () => onSelect(inc.id));
      marker.addTo(markersRef.current!);
    });

  }, [incidents, onSelect, markersVisible, lang]);

  const handleLocate = useCallback(() => {
    if (!mapRef.current || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mapRef.current) return;
        if (locateMarkerRef.current) locateMarkerRef.current.remove();
        locateMarkerRef.current = L.marker([coords.latitude, coords.longitude], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:12px;height:12px;background:#a78bfa;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px #a78bfa99"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
          interactive: false,
        }).addTo(mapRef.current);
        mapRef.current.setView([coords.latitude, coords.longitude], 13, { animate: true });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // 유저 신고 깃발 마커 — zoom 무관, 항상 표시
  useEffect(() => {
    if (!flagMarkersRef.current) return;
    flagMarkersRef.current.clearLayers();
    if (!showPendingReports) return;
    pendingReports.forEach((inc) => {
      if (inc.lat == null || inc.lng == null) return;
      const group = CATEGORY_GROUPS[getCategoryGroup(inc.category)];
      const marker = L.marker([inc.lat, inc.lng], { icon: createFlagIcon(), zIndexOffset: 500 });
      marker.bindPopup(
        `<div style="font-family:var(--font-mono),monospace;font-size:12px;min-width:180px">
          <div style="color:#f59e0b;font-size:10px;text-transform:uppercase;margin-bottom:4px;font-weight:700">
            ${lang === "de" ? "Nutzer-Meldung" : "User Report"}
          </div>
          <div style="color:${group.color};margin-bottom:2px;text-transform:uppercase;font-size:10px">${group.label[lang]}</div>
          <div style="color:#9ca3af;font-size:11px">${inc.address_raw || "—"}</div>
        </div>`,
      );
      marker.addTo(flagMarkersRef.current!);
    });
  }, [pendingReports, showPendingReports, lang]);

  // Pan to selected
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const inc = incidents.find((i) => i.id === selectedId);
    if (inc?.lat != null && inc?.lng != null) {
      mapRef.current.setView([inc.lat, inc.lng], 14, { animate: true });
    }
  }, [selectedId, incidents]);

  return (
    <>
      <style>{`
        .choropleth-tooltip { background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important; }
        .choropleth-tooltip::before { display:none!important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
      <button
        onClick={handleLocate}
        className="absolute top-[78px] left-[10px] z-[1000] w-[26px] h-[26px] bg-bg-raised border border-border text-fg-dim hover:text-accent flex items-center justify-center transition-colors duration-150"
        title={lang === "de" ? "Meinen Standort" : "My location"}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
          <line x1="6.5" y1="0" x2="6.5" y2="2" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="6.5" y1="11" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="0" y1="6.5" x2="2" y2="6.5" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="11" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </button>
      {!markersVisible && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-raised/80 border border-border px-3 py-1.5 text-[11px] font-mono text-fg-dim pointer-events-none">
          {lang === "de" ? "Reinzoomen für Details" : "Zoom in for details"}
        </div>
      )}
    </>
  );
}
