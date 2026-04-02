"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Incident } from "@/types/incident";
import { CATEGORIES } from "@/types/incident";

const BERLIN_CENTER: [number, number] = [52.52, 13.405];
const DEFAULT_ZOOM = 11;

function createMarkerIcon(category: string): L.DivIcon {
  const color = CATEGORIES[category]?.color || "#71717a";
  return L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="
      width:16px;height:16px;
      background:${color};
      border:2px solid ${color}66;
      box-shadow:0 0 8px ${color}aa;
    "></div>`,
  });
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: BERLIN_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addAttribution(
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      )
      .addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    incidents.forEach((inc) => {
      if (inc.lat == null || inc.lng == null) return;

      const marker = L.marker([inc.lat, inc.lng], {
        icon: createMarkerIcon(inc.category),
      });

      marker.bindPopup(
        `<div style="font-family:var(--font-mono),monospace;font-size:12px;min-width:200px">
          <div style="font-weight:700;margin-bottom:4px;font-size:13px">${inc.title_de || "—"}</div>
          <div style="color:#a1a1aa;margin-bottom:2px">${inc.district || "—"} · ${inc.category.toUpperCase()}</div>
          <div style="color:#71717a;font-size:11px">${inc.occurred_at ? new Date(inc.occurred_at).toLocaleDateString("de-DE") : "—"}</div>
        </div>`,
      );

      marker.on("click", () => onSelect(inc.id));
      marker.addTo(markersRef.current!);
    });
  }, [incidents, onSelect]);

  // Pan to selected
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const inc = incidents.find((i) => i.id === selectedId);
    if (inc?.lat != null && inc?.lng != null) {
      mapRef.current.setView([inc.lat, inc.lng], 14, { animate: true });
    }
  }, [selectedId, incidents]);

  return <div ref={containerRef} className="w-full h-full" />;
}
