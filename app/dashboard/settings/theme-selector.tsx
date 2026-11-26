"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export const THEMES = [
  {
    id: "light",
    label: "TRUXERA Light",
    description: "Official default — clean enterprise light theme",
    swatch: ["#F8FAFC", "#FFFFFF", "#06B6D4"],
    isDefault: true,
  },
  {
    id: "dark",
    label: "TRUXERA Dark",
    description: "Modern fleet command center dark mode",
    swatch: ["#070B14", "#0F172A", "#06B6D4"],
    isDefault: false,
  },
  {
    id: "binance",
    label: "Binance-inspired",
    description: "Dark high-contrast data-focused skin",
    swatch: ["#0B0E11", "#181A20", "#F0B90B"],
    isDefault: false,
  },
  {
    id: "purple",
    label: "Classic Purple",
    description: "Original TRUXERA indigo identity",
    swatch: ["#EEF0FB", "#FFFFFF", "#4F46E5"],
    isDefault: false,
  },
  {
    id: "terminal",
    label: "TRUXERA Terminal",
    description: "Dark operations console with orange accents",
    swatch: ["#0B0E12", "#12161C", "#F59E0B"],
    isDefault: false,
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "truxera-theme";

function ThemeGlyph({ theme }: { theme: (typeof THEMES)[number] }) {
  const [bg, surface, accent] = theme.swatch;
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border"
      style={{
        backgroundColor: bg,
        borderColor: accent,
      }}
    >
      <span
        className="block h-4 w-7 rounded-sm"
        style={{ backgroundColor: surface, border: `1px solid ${accent}` }}
      />
    </span>
  );
}

const subscribe = () => () => {};

export default function ThemeSelector() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [active, setActive] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.some((theme) => theme.id === stored)
      ? (stored as ThemeId)
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = active;
    window.localStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  const select = (id: ThemeId) => setActive(id);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance theme"
      className="grid gap-2 sm:grid-cols-2"
    >
      {THEMES.map((theme) => {
        const selected = mounted && active === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => select(theme.id)}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selected
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
          >
            <ThemeGlyph theme={theme} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                {theme.label}
                {theme.isDefault && (
                  <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--primary)]">
                    Default
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                {theme.description}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`ml-auto h-4 w-4 shrink-0 rounded-full border-2 ${
                selected
                  ? "border-[var(--primary)] bg-[var(--primary)]"
                  : "border-[var(--border-strong)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
