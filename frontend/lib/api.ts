import type { Incident, IncidentDetail, DistrictStat } from "@/types/incident";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://dk-crime-api.onrender.com";

export async function fetchIncidents(params?: {
  district?: string;
  limit?: number;
}): Promise<{ data: Incident[]; count: number }> {
  const sp = new URLSearchParams();
  if (params?.district) sp.set("district", params.district);
  if (params?.limit) sp.set("limit", String(params.limit));

  const res = await fetch(`${API_BASE}/incidents?${sp}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchIncidentDetail(
  id: string,
): Promise<IncidentDetail> {
  const res = await fetch(`${API_BASE}/incidents/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<{ data: DistrictStat[] }> {
  const res = await fetch(`${API_BASE}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchBikeTheftsAsIncidents(): Promise<Incident[]> {
  const [theftsRes, centroidsRes] = await Promise.all([
    fetch(`${API_BASE}/bike-thefts?limit=2000`, { cache: "no-store" }),
    fetch("/lor-centroids.json"),
  ]);
  if (!theftsRes.ok) return [];
  const { data } = await theftsRes.json();
  const centroids: Record<string, [number, number]> = centroidsRes.ok
    ? await centroidsRes.json()
    : {};

  return (data || []).map((bt: Record<string, string | number | boolean>, i: number) => {
    const lor = String(bt.lor_code || "");
    const [lat, lng] = centroids[lor] || [null, null];
    return {
      id: `bike-${i}-${lor}`,
      source: "fahrrad_data",
      title_de: `Fahrraddiebstahl — ${bt.bike_type || "Fahrrad"}${bt.damage_eur ? ` (${bt.damage_eur}€)` : ""}`,
      title_en: `Bike theft — ${bt.bike_type || "Bicycle"}${bt.damage_eur ? ` (${bt.damage_eur}€)` : ""}`,
      district: bt.district || null,
      address_raw: null,
      lat,
      lng,
      category: "theft",
      occurred_at: bt.occurred_at || null,
      scraped_at: "",
    } as Incident;
  });
}

export async function fetchBikeTheftsByLor(): Promise<{ data: Record<string, number> }> {
  const res = await fetch(`${API_BASE}/bike-thefts/by-lor`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchPendingReports(): Promise<Incident[]> {
  try {
    const res = await fetch(`${API_BASE}/reports/pending`, { cache: "no-store" });
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data || []).map((r: Incident) => ({ ...r, is_verified: false }));
  } catch {
    return [];
  }
}

export async function submitReport(payload: {
  address_raw: string;
  category: string;
  reporter_note: string;
  lat: number;
  lng: number;
  user_lat?: number;
  user_lng?: number;
  turnstile_token: string;
}): Promise<{ id: string; expires_at: string }> {
  const res = await fetch(`${API_BASE}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new Error("rateLimit");
  if (res.status === 422) throw new Error("validation");
  if (res.status === 403) throw new Error("botCheck");
  if (res.status === 503) throw new Error("disabled");
  if (!res.ok) throw new Error(`submitError:${res.status}`);
  return res.json();
}
