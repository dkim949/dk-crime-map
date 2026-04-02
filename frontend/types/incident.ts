export interface Incident {
  id: string;
  source: string;
  title_de: string;
  title_en?: string;
  district: string | null;
  address_raw: string | null;
  lat: number | null;
  lng: number | null;
  category: string;
  occurred_at: string | null;
  scraped_at: string;
}

export interface IncidentDetail extends Incident {
  body_de: string | null;
  source_url: string | null;
}

export interface DistrictStat {
  district: string;
  category: string;
  count: number;
}

export const CATEGORIES: Record<string, { label: string; color: string }> = {
  theft: { label: "Theft", color: "#ef4444" },
  assault: { label: "Assault", color: "#f97316" },
  shooting: { label: "Shooting", color: "#dc2626" },
  fraud: { label: "Fraud", color: "#eab308" },
  drugs: { label: "Drugs", color: "#a855f7" },
  traffic: { label: "Traffic", color: "#3b82f6" },
  fire: { label: "Fire", color: "#f59e0b" },
  missing: { label: "Missing", color: "#6366f1" },
  homicide: { label: "Homicide", color: "#be123c" },
  other: { label: "Other", color: "#71717a" },
};
