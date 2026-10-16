"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SEED_RECIPES } from "@/lib/recipes";
import { matchesFacet, type Facet } from "@/lib/search";
import type { Recipe } from "@/lib/types";
import { DishArt } from "./DishArt";
import { ArrowRight } from "./Icons";

// A bento of cuisines. Each tile has its own drawn motif, a stack of real
// dishes from the library, and the names you'd recognise.

type Size = "tall" | "wide" | "small";

interface Tile {
  id: Facet;
  label: string;
  kicker: string;
  bg: string;
  ink: string;
  size: Size;
  samples: string[];
  motif: (c: string) => ReactNode;
}

const kolam = (c: string) => (
  <pattern id="kolam" width="18" height="18" patternUnits="userSpaceOnUse">
    <circle cx="9" cy="9" r="1.4" fill={c} />
    <path d="M9 3 Q15 9 9 15 Q3 9 9 3Z" fill="none" stroke={c} strokeWidth="0.8" />
  </pattern>
);
const fronds = (c: string) => (
  <pattern id="fronds" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
    <path d="M0 14 H28 M6 14 L10 8 M12 14 L16 8 M18 14 L22 8 M6 14 L10 20 M12 14 L16 20 M18 14 L22 20" fill="none" stroke={c} strokeWidth="1" strokeLinecap="round" />
  </pattern>
);
const paisley = (c: string) => (
  <pattern id="paisley" width="30" height="30" patternUnits="userSpaceOnUse">
    <path d="M15 6 C22 6 24 16 17 20 C12 23 8 18 11 14 C13 11 17 13 15 15" fill="none" stroke={c} strokeWidth="1" />
  </pattern>
);
const steamWaves = (c: string) => (
  <pattern id="steam" width="24" height="20" patternUnits="userSpaceOnUse">
    <path d="M0 10 Q6 4 12 10 T24 10" fill="none" stroke={c} strokeWidth="1" />
  </pattern>
);
const chopsticks = (c: string) => (
  <pattern id="chop" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <path d="M4 0 V22 M9 0 V22" stroke={c} strokeWidth="1.1" />
  </pattern>
);
const stars = (c: string) => (
  <pattern id="stars" width="26" height="26" patternUnits="userSpaceOnUse">
    <path d="M13 6 L14.5 11 L19.5 11 L15.5 14 L17 19 L13 16 L9 19 L10.5 14 L6.5 11 L11.5 11Z" fill="none" stroke={c} strokeWidth="0.9" strokeLinejoin="round" />
  </pattern>
);
const sunrise = (c: string) => (
  <pattern id="sun" width="32" height="32" patternUnits="userSpaceOnUse">
    <circle cx="16" cy="20" r="5" fill="none" stroke={c} strokeWidth="1" />
    <path d="M16 9 V12 M7 20 H4 M28 20 H25 M9.5 13.5 L11.5 15.5 M22.5 13.5 L20.5 15.5" stroke={c} strokeWidth="1" strokeLinecap="round" />
  </pattern>
);
const sprinkles = (c: string) => (
  <pattern id="sprinkle" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M4 5 l3 2 M14 3 l-2 3 M10 13 l3 -1 M3 15 l2 3 M16 15 l2 2" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
  </pattern>
);

const TILES: Tile[] = [
  { id: "tamil", label: "Tamil", kicker: "Kuzhambu, poriyal, rice", bg: "#d9b29c", ink: "#6a3a25", size: "tall", samples: ["sambar", "idli", "puli-sadham"], motif: kolam },
  { id: "kerala", label: "Kerala", kicker: "Coconut & curry leaf", bg: "#cddbb8", ink: "#355236", size: "small", samples: ["avial", "appam"], motif: fronds },
  { id: "north", label: "North Indian", kicker: "Paneer, dal, roti", bg: "#f0b7a4", ink: "#8a2b1a", size: "small", samples: ["paneer-butter-masala", "chole-masala"], motif: paisley },
  { id: "biryani", label: "Biryani", kicker: "One-pot, in the cooker", bg: "#f3d696", ink: "#7a5310", size: "wide", samples: ["chicken-biryani", "veg-biryani", "egg-biryani"], motif: steamWaves },
  { id: "tiffin", label: "Tiffin", kicker: "Idli, dosa, chutney", bg: "#efe7d6", ink: "#6b5a3e", size: "small", samples: ["plain-dosa", "rava-upma"], motif: sunrise },
  { id: "indochinese", label: "Indo-Chinese", kicker: "Noodles & manchurian", bg: "#e8a08c", ink: "#7a1f10", size: "small", samples: ["veg-hakka-noodles", "gobi-manchurian"], motif: chopsticks },
  { id: "kids", label: "Kids' meals", kicker: "Mild & lunchbox-ready", bg: "#b9cbb1", ink: "#2c4a2d", size: "small", samples: ["banana-pancakes", "veg-cheese-sandwich"], motif: stars },
  { id: "dessert", label: "Sweets", kicker: "Payasam, kesari, halwa", bg: "#f2d4c7", ink: "#7c3b2a", size: "small", samples: ["rava-kesari", "paal-payasam"], motif: sprinkles },
  { id: "treats", label: "Kids' treats", kicker: "Low-sugar cakes, muffins & cookies", bg: "#f6dfb0", ink: "#6e4a12", size: "wide", samples: ["banana-oat-muffins", "ragi-chocolate-cake", "oat-peanut-butter-cookies"], motif: sprinkles },
];

const PATTERN_ID: Partial<Record<Facet, string>> = { tamil: "kolam", kerala: "fronds", north: "paisley", biryani: "steam", indochinese: "chop", kids: "stars", tiffin: "sun", dessert: "sprinkle" };

const byId = new Map(SEED_RECIPES.map((r) => [r.id, r]));

function TileCard({ t, count }: { t: Tile; count: number }) {
  const dishes = t.samples.map((id) => byId.get(id)).filter((r): r is Recipe => !!r);
  const fallback = SEED_RECIPES.filter((r) => matchesFacet(r, t.id)).slice(0, 3);
  const plates = (dishes.length ? dishes : fallback).slice(0, t.size === "small" ? 2 : 3);
  const span = t.size === "tall" ? "row-span-2" : t.size === "wide" ? "col-span-2" : "";
  const plateSize = t.size === "small" ? 70 : 92;

  return (
    <Link
      href={`/search?f=${t.id}`}
      aria-label={`${t.label} ${count}`}
      className={`press group relative isolate overflow-hidden rounded-[26px] p-3.5 ${span}`}
      style={{ background: t.bg, color: t.ink }}
    >
      {/* drawn motif */}
      <svg className="absolute inset-0 -z-10 h-full w-full opacity-[0.22]" aria-hidden>
        <defs>{t.motif(t.ink)}</defs>
        <rect width="100%" height="100%" fill={`url(#${PATTERN_ID[t.id]})`} />
      </svg>
      {/* soft light from the top-left */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,.45),transparent_60%)]" aria-hidden />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className={`font-display leading-[0.95] ${t.size === "small" ? "text-[22px]" : "text-[27px]"}`} style={{ color: "#1c1813" }}>
            {t.label}
          </span>
          <span className="shrink-0 rounded-full bg-white/55 px-2 py-0.5 text-[11px] font-semibold tnum backdrop-blur-sm">{count}</span>
        </div>
        <span className="mt-1 text-[11.5px] font-medium leading-tight opacity-80">{t.kicker}</span>
        {t.size !== "small" && (
          <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-white/60 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-sm">
            Explore <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>

      {/* plates bleeding off the edge */}
      <div className={`pointer-events-none absolute ${t.size === "wide" ? "-bottom-5 right-2 flex" : t.size === "tall" ? "-bottom-6 -right-5 flex flex-col items-end" : "-bottom-5 -right-4 flex"}`} aria-hidden>
        {plates.map((r, i) => (
          <div
            key={r.id}
            className="transition-transform duration-500 group-hover:rotate-6"
            style={{
              marginLeft: t.size !== "tall" && i ? -plateSize * 0.38 : 0,
              marginTop: t.size === "tall" && i ? -plateSize * 0.3 : 0,
              marginRight: t.size === "tall" ? i * 26 : 0,
              transform: `rotate(${(i - 1) * 9}deg)`,
              filter: "drop-shadow(0 6px 10px rgba(28,24,19,.18))",
            }}
          >
            <div style={{ width: plateSize, height: plateSize }}>
              <DishArt recipe={r} className="block h-full w-full" />
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function CuisineTiles() {
  return (
    <div className="grid auto-rows-[124px] grid-cols-2 gap-2.5">
      {TILES.map((t) => {
        const count = SEED_RECIPES.filter((r) => matchesFacet(r, t.id)).length;
        return count ? <TileCard key={t.id} t={t} count={count} /> : null;
      })}
    </div>
  );
}
