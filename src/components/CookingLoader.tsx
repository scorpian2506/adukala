"use client";

import { useEffect, useState } from "react";
import type { StepKind } from "@/lib/types";
import { StepArt } from "./StepArt";

const SCENES: StepKind[] = ["measure", "chop", "add", "stir", "pressure"];

// Shown while the AI works. It takes a while, so make the wait feel like cooking.
export function CookingLoader({ title, lines, inline = false }: { title: string; lines: string[]; inline?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 3200);
    return () => clearInterval(t);
  }, []);
  const line = lines[Math.min(i, lines.length - 1)];
  const scene = SCENES[i % SCENES.length];

  return (
    <div className={`${inline ? "py-8" : "app-h"} flex flex-col items-center justify-center px-8 text-center`}>
      <div key={scene} className="animate-fade">
        <StepArt kind={scene} equipment={scene === "pressure" ? "pressure_cooker" : undefined} className="h-36 w-44" />
      </div>
      <h2 className="font-display mt-4 text-[30px] leading-[1.02]">{title}</h2>
      <p key={line} className="animate-rise mt-3 text-[14px] text-ink-2">
        {line}
        <span className="inline-flex w-5">
          {[0, 1, 2].map((d) => (
            <span key={d} style={{ animation: `dots 1.2s ${d * 0.2}s infinite` }}>
              .
            </span>
          ))}
        </span>
      </p>
      <div className="mt-6 flex gap-1.5">
        {lines.map((_, n) => (
          <span key={n} className={`h-1 rounded-full transition-all duration-500 ${n <= i ? "w-6 bg-ink" : "w-3 bg-line-2"}`} />
        ))}
      </div>
    </div>
  );
}
