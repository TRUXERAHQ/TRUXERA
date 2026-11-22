import type { ReactNode } from "react";
import { TruckLineArt } from "./truck-line-art";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.12fr_1fr]">
      {/* Desktop visual panel */}
      <aside className="relative hidden flex-col overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 px-10 pb-12 pt-16 text-white lg:flex xl:px-14 xl:pb-14 xl:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl"
        />
        <p className="relative text-sm font-bold uppercase tracking-[0.3em] text-indigo-200">
          TRUXERA
        </p>
        <div className="relative mt-10 flex flex-1 flex-col items-center justify-center text-center">
          <p className="w-full max-w-[34rem] text-3xl font-bold leading-tight text-white">
            AI-Powered Intelligent Fleet Operations &amp; Recovery Platform
          </p>
          <p className="mt-4 w-full whitespace-nowrap text-center text-[clamp(11px,1.1vw,16px)] leading-6 text-indigo-200/90">
            Detect Risk. Predict Disruption. Recommend Recovery. Measure Impact.
          </p>
          <div className="-mx-6 mt-10 self-stretch">
            <TruckLineArt tall className="h-auto w-full" />
          </div>
        </div>
      </aside>

      {/* Compact mobile/tablet brand band */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 px-6 pb-5 pt-5 text-white lg:hidden">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-200">
            TRUXERA
          </p>
          <p className="hidden text-[11px] font-medium uppercase tracking-wider text-indigo-200/80 sm:block">
            Fleet Intelligence
          </p>
        </div>
        <TruckLineArt className="mt-1 h-auto w-full max-w-lg opacity-95" />
      </div>

      {/* Authentication panel */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
