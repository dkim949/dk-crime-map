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

export async function fetchBikeTheftsByLor(): Promise<{ data: Record<string, number> }> {
  const res = await fetch(`${API_BASE}/bike-thefts/by-lor`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
