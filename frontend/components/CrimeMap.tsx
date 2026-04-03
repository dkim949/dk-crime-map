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
const CHOROPLETH_FILL = "#22d3ee";
const CHOROPLETH_BORDER = "#1e293b";
const MIN_OPACITY = 0.1;
const MAX_OPACITY = 0.45;

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

function computeOpacity(count: number, maxCount: number, cap: number = MAX_OPACITY): number {
  if (maxCount === 0) return MIN_OPACITY;
  // Log scale to prevent single incidents from dominating
  const ratio = Math.log(count + 1) / Math.log(maxCount + 1);
  return MIN_OPACITY + ratio * (cap - MIN_OPACITY);
}

function getTitle(inc: Incident, lang: "de" | "en"): string {
  if (lang === "en" && inc.title_en) return inc.title_en;
  return inc.title_de || "—";
}

interface CrimeMapProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: "de" | "en";
}

export default function CrimeMap({
  incidents,
  selectedId,
  onSelect,
  lang,
}: CrimeMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const choroplethRef = useRef<L.GeoJSON | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
    labelsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("zoomend", handleZoom);
    return () => { map.off("zoomend", handleZoom); map.remove(); mapRef.current = null; };
  }, [handleZoom]);

  // Crime choropleth (Bezirk level) — bike layer ON이면 숨김
  useEffect(() => {
    if (!mapRef.current || !geoData) return;
    if (choroplethRef.current) { choroplethRef.current.remove(); choroplethRef.current = null; }
    if (labelsRef.current) labelsRef.current.clearLayers();

    const districtCounts = countByDistrict(incidents);
    const maxCount = Math.max(...Object.values(districtCounts), 1);

    const choropleth = L.geoJSON(geoData as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const name = feature?.properties?.name || "";
        const count = matchDistrictName(name, districtCounts);
        return {
          fillColor: CHOROPLETH_FILL,
          fillOpacity: computeOpacity(count, maxCount),
          color: CHOROPLETH_BORDER,
          weight: 1,
          opacity: 0.6,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || "";
        const count = matchDistrictName(name, districtCounts);
        layer.bindTooltip(
          `<div style="font-family:var(--font-mono),monospace;font-size:12px;padding:6px 10px;background:#12121aee;color:#e4e4e7;border:1px solid #22d3ee44;">
            <span style="font-weight:700;color:#22d3ee">${name}</span>
            <span style="color:#9ca3af;margin-left:6px">${count}</span>
          </div>`,
          { sticky: true, direction: "top", offset: [0, -10], className: "choropleth-tooltip" },
        );
        layer.on("mouseover", () => {
          (layer as L.Path).setStyle({ weight: 2, color: "#22d3ee66", fillOpacity: Math.min(computeOpacity(count, maxCount) + 0.15, 0.75) });
        });
        layer.on("mouseout", () => choropleth.resetStyle(layer));
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
          html: `<div style="font-family:var(--font-mono),monospace;font-size:13px;font-weight:700;color:#22d3ee;text-shadow:0 0 8px #0a0a0f,0 0 4px #0a0a0f;text-align:center;white-space:nowrap">${count}</div>`,
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
  }, [geoData, incidents]);

  // Markers
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();
    if (!markersVisible) return;
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
      {!markersVisible && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-bg-raised/80 border border-border px-3 py-1.5 text-[11px] font-mono text-fg-dim pointer-events-none">
          {lang === "de" ? "Reinzoomen für Details" : "Zoom in for details"}
        </div>
      )}
    </>
  );
}
