const translations = {
  de: {
    period: "Zeitraum",
    category: "Kategorie",
    district: "Bezirk",
    all: "Alle",
    incidents: "Vorfälle",
    mapped: "kartiert",
    loading: "Laden...",
    noIncidents: "Keine Vorfälle gefunden",
    connectionError: "Verbindungsfehler",
    retry: "Erneut versuchen",
    violent: "Gewalt",
    property: "Eigentum",
    other: "Sonstiges",
  },
  en: {
    period: "Period",
    category: "Category",
    district: "District",
    all: "All",
    incidents: "incidents",
    mapped: "mapped",
    loading: "Loading...",
    noIncidents: "No incidents found",
    connectionError: "Connection Error",
    retry: "Retry",
    violent: "Violent",
    property: "Property",
    other: "Other",
  },
} as const;

export type Lang = "de" | "en";
export type I18nKey = keyof (typeof translations)["de"];

export function t(lang: Lang, key: I18nKey): string {
  return translations[lang][key];
}
