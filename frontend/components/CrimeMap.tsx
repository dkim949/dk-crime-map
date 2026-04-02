"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import type { Incident } from "@/types/incident";
import { CATEGORIES } from "@/types/incident";

const BERLIN_CENTER: [number, number] = [52.52, 13.405];
const DEFAULT_ZOOM = 11;
const MARKER_VISIBLE_ZOOM = 13;
const MARKER_SIZE = 10;
const CHOROPLETH_FILL = "#dc2626";
const CHOROPLETH_BORDER = "#3f3f46";
const MIN_OPACITY = 0.05;
const MAX_OPACITY = 0.7;

interface GeoJsonFeature {
  type: "Feature";
  properties: { name: string; schluessel: string };
  geometry: GeoJSON.Geometry;
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

function createMarkerIcon(category: string): L.DivIcon {
  const color = CATEGORIES[category]?.color || "#71717a";
  return L.divIcon({
    className: "",
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    html: `<div style="
      width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;
      background:${color};
      border:2px solid ${color}66;
      box-shadow:0 0 6px ${color}aa;
    "></div>`,
  });
}

function countByDistrict(incidents: Incident[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const inc of incidents) {
    if (!inc.district) continue;
    const key = inc.district.trim();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function matchDistrictName(
  geoName: string,
  districtCounts: Record<string, number>,
): number {
  // Exact match
  if (districtCounts[geoName] != null) return districtCounts[geoName];

  // Case-insensitive match
  const lower = geoName.toLowerCase();
  for (const [key, count] of Object.entries(districtCounts)) {
    if (key.toLowerCase() === lower) return count;
  }

  // Partial match: either side contains the other
  for (const [key, count] of Object.entries(districtCounts)) {
    if (
      lower.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lower)
    ) {
      return count;
    }
  }

  return 0;
}

function computeOpacity(count: number, maxCount: number): number {
  if (maxCount === 0) return MIN_OPACITY;
  return MIN_OPACITY + (count / maxCount) * (MAX_OPACITY - MIN_OPACITY);
}

function createTooltipContent(name: string, count: number): string {
  return `<div style="
    font-family:var(--font-mono),ui-monospace,monospace;
    font-size:12px;
    padding:4px 8px;
    background:#18181b;
    color:#fafafa;
    border:1px solid ${CHOROPLETH_BORDER};
  "><span style="font-weight:700">${name}</span> <span style="color:#a1a1aa;margin-left:4px">${count}</span></div>`;
}

interface CrimeMapProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function CrimeMap({
  incidents,
  selectedId,
  onSelect,
}: CrimeMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const choroplethRef = useRef<L.GeoJSON | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geoData, setGeoData] = useState<GeoJsonCollection | null>(null);
  const [markersVisible, setMarkersVisible] = useState(
    DEFAULT_ZOOM >= MARKER_VISIBLE_ZOOM,
  );

  // Load GeoJSON
  useEffect(() => {
    fetch("/berlin-bezirke.geojson")
      .then((res) => res.json())
      .then((data: GeoJsonCollection) => setGeoData(data))
      .catch((err) => console.error("Failed to load GeoJSON:", err));
  }, []);

  // Zoom handler for marker visibility
  const handleZoom = useCallback(() => {
    if (!mapRef.current) return;
    const zoom = mapRef.current.getZoom();
    setMarkersVisible(zoom >= MARKER_VISIBLE_ZOOM);
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

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19 },
    ).addTo(map);

    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addAttribution(
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      )
      .addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("zoomend", handleZoom);

    return () => {
      map.off("zoomend", handleZoom);
      map.remove();
      mapRef.current = null;
    };
  }, [handleZoom]);

  // Choropleth layer
  useEffect(() => {
    if (!mapRef.current || !geoData) return;

    // Remove previous choropleth
    if (choroplethRef.current) {
      choroplethRef.current.remove();
      choroplethRef.current = null;
    }

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
          opacity: 0.8,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || "";
        const count = matchDistrictName(name, districtCounts);

        layer.bindTooltip(createTooltipContent(name, count), {
          sticky: true,
          direction: "top",
          offset: [0, -10],
          className: "choropleth-tooltip",
        });

        layer.on("mouseover", () => {
          (layer as L.Path).setStyle({
            weight: 2,
            fillOpacity: Math.min(
              computeOpacity(count, maxCount) + 0.15,
              0.85,
            ),
          });
        });

        layer.on("mouseout", () => {
          choropleth.resetStyle(layer);
        });
      },
    });

    choropleth.addTo(mapRef.current);
    // Ensure choropleth is behind markers
    choropleth.bringToBack();
    choroplethRef.current = choropleth;

    return () => {
      if (choroplethRef.current) {
        choroplethRef.current.remove();
        choroplethRef.current = null;
      }
    };
  }, [geoData, incidents]);

  // Update markers (only visible when zoomed in)
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    if (!markersVisible) return;

    incidents.forEach((inc) => {
      if (inc.lat == null || inc.lng == null) return;

      const marker = L.marker([inc.lat, inc.lng], {
        icon: createMarkerIcon(inc.category),
      });

      marker.bindPopup(
        `<div style="font-family:var(--font-mono),ui-monospace,monospace;font-size:12px;min-width:200px">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px">${inc.title_de || "—"}</div>
          <div style="color:#a1a1aa;margin-bottom:2px">${inc.district || "—"} · ${inc.category.toUpperCase()}</div>
          <div style="color:#71717a;font-size:11px">${inc.occurred_at ? new Date(inc.occurred_at).toLocaleDateString("de-DE") : "—"}</div>
        </div>`,
      );

      marker.on("click", () => onSelect(inc.id));
      marker.addTo(markersRef.current!);
    });
  }, [incidents, onSelect, markersVisible]);

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
        .choropleth-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .choropleth-tooltip::before {
          display: none !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
