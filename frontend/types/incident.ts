export interface Incident {
  id: string;
  source: string;
  title_de: string;
  title_en?: string | null;
  district: string | null;
  address_raw: string | null;
  lat: number | null;
  lng: number | null;
  category: string;
  occurred_at: string | null;
  scraped_at: string;
  is_verified?: boolean;
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

export interface CategoryGroup {
  label: { de: string; en: string };
  color: string;
  shape: "triangle" | "diamond" | "circle" | "square";
  sources: string[];
}

/** Colorblind-safe palette: blue, amber, purple, gray + geometric shapes */
export const CATEGORY_GROUPS: Record<string, CategoryGroup> = {
  violent: {
    label: { de: "Gewalt", en: "Violent" },
    color: "#e0115f",
    shape: "triangle",
    sources: ["assault", "shooting", "homicide"],
  },
  property: {
    label: { de: "Eigentum", en: "Property" },
    color: "#fbbf24",
    shape: "diamond",
    sources: ["theft", "fraud"],
  },
  other: {
    label: { de: "Sonstiges", en: "Other" },
    color: "#94a3b8",
    shape: "square",
    sources: ["traffic", "drugs", "fire", "missing", "other"],
  },
};

export function getCategoryGroup(category: string): string {
  for (const [group, config] of Object.entries(CATEGORY_GROUPS)) {
    if (config.sources.includes(category)) return group;
  }
  return "other";
}

export function getCategoryColor(category: string): string {
  const group = getCategoryGroup(category);
  return CATEGORY_GROUPS[group]?.color || "#94a3b8";
}
