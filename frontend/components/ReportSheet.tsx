"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { t, type Lang } from "@/lib/i18n";
import { submitReport } from "@/lib/api";

const REPORT_CATEGORIES = [
  { key: "assault", labelKey: "reportCatAssault" as const, icon: "⚡" },
  { key: "theft",   labelKey: "reportCatTheft"   as const, icon: "👜" },
  { key: "theft",   labelKey: "reportCatBike"    as const, icon: "🚲" },
  { key: "drugs",   labelKey: "reportCatDrugs"   as const, icon: "💊" },
  { key: "fire",    labelKey: "reportCatFire"    as const, icon: "🔥" },
  { key: "other",   labelKey: "reportCatOther"   as const, icon: "•••" },
] as const;

interface ReportSheetProps {
  lang: Lang;
  pin: { lat: number; lng: number } | null;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReportSheet({
  lang,
  pin,
  userLocation,
  onClose,
  onSuccess,
}: ReportSheetProps) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedCatIdx, setSelectedCatIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  // Load Cloudflare Turnstile widget
  useEffect(() => {
    if (!siteKey || !turnstileContainerRef.current) return;

    function renderWidget() {
      if (!turnstileContainerRef.current || !(window as any).turnstile) return;
      widgetIdRef.current = (window as any).turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: siteKey,
          theme: "dark",
          size: "compact",
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        },
      );
    }

    if ((window as any).turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector('script[src*="turnstile"]');
      if (!existing) {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = renderWidget;
        document.head.appendChild(s);
      } else {
        existing.addEventListener("load", renderWidget);
      }
    }

    return () => {
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const canSubmit =
    selectedCat !== null &&
    agreed &&
    pin !== null &&
    (!siteKey || turnstileToken !== "");

  const handleSubmit = useCallback(async () => {
    if (!pin || selectedCat === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        address_raw: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`,
        category: selectedCat,
        reporter_note: note.trim(),
        lat: pin.lat,
        lng: pin.lng,
        user_lat: userLocation?.lat,
        user_lng: userLocation?.lng,
        turnstile_token: turnstileToken,
      });
      onSuccess();
    } catch (e: any) {
      if (e.message === "rateLimit") setError(t(lang, "reportRateLimit"));
      else if (e.message === "tooFar") setError(t(lang, "reportTooFar"));
      else setError(t(lang, "reportError"));
    } finally {
      setSubmitting(false);
    }
  }, [pin, selectedCat, note, userLocation, turnstileToken, lang, onSuccess]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-[2000] flex flex-col bg-bg-raised border-t border-border max-h-[80dvh] overflow-y-auto animate-slide-up md:max-w-sm md:right-4 md:bottom-4 md:inset-x-auto md:border md:rounded-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-bold uppercase tracking-tight text-accent">
          {t(lang, "reportTitle")}
        </h2>
        <button onClick={onClose} className="text-fg-dim hover:text-fg text-lg leading-none">
          ✕
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Location indicator */}
        {pin ? (
          <p className="text-[11px] font-mono text-fg-dim">
            📍 {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </p>
        ) : (
          <p className="text-[11px] font-mono text-amber-400">
            ⚠ {t(lang, "reportPlacePin")}
          </p>
        )}

        {/* Category grid */}
        <div>
          <p className="text-[11px] font-mono text-fg-dim uppercase tracking-widest mb-2">
            {t(lang, "reportCategoryLabel")}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {REPORT_CATEGORIES.map((cat, i) => (
              <button
                key={`${cat.key}-${i}`}
                onClick={() => { setSelectedCat(cat.key); setSelectedCatIdx(i); }}
                className={`
                  flex flex-col items-center gap-1 py-2 px-1 border text-[11px] font-mono
                  transition-all duration-150
                  ${selectedCatIdx === i
                    ? "bg-accent/10 border-accent text-accent"
                    : "border-border text-fg-dim hover:border-border-bright hover:text-fg"
                  }
                `}
              >
                <span className="text-base leading-none">{cat.icon}</span>
                <span className="text-center leading-tight">{t(lang, cat.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <p className="text-[11px] font-mono text-fg-dim uppercase tracking-widest mb-1">
            {t(lang, "reportDescLabel")}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder={t(lang, "reportDescPlaceholder")}
            rows={2}
            className="w-full bg-bg-surface border border-border text-fg text-xs font-mono px-2 py-1.5 resize-none focus:outline-none focus:border-accent placeholder:text-fg-dim"
          />
          <p className="text-[10px] text-fg-dim text-right tabular-nums">{note.length}/200</p>
        </div>

        {/* Turnstile */}
        {siteKey && (
          <div>
            <div ref={turnstileContainerRef} />
          </div>
        )}

        {/* Disclaimer */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="text-[11px] text-fg-dim leading-snug">
            {t(lang, "reportDisclaimer")}
          </span>
        </label>

        {/* Error */}
        {error && (
          <p className="text-[11px] text-red-400 font-mono">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pb-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-border text-xs font-mono text-fg-dim hover:text-fg transition-colors"
          >
            {t(lang, "reportCancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`
              flex-1 py-2 text-xs font-mono border transition-all duration-150
              ${canSubmit && !submitting
                ? "bg-accent text-bg border-accent hover:opacity-90"
                : "border-border text-fg-dim cursor-not-allowed opacity-50"
              }
            `}
          >
            {submitting ? "..." : t(lang, "reportSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
