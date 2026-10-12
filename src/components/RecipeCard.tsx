"use client";

import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { REGION_LABEL, totalMinutes } from "@/lib/format";
import { DishArt } from "./DishArt";
import { Clock, Star } from "./Icons";
import { isMarked, toggleMark, useMarks } from "@/lib/store";

export const HUE_BG: Record<Recipe["hue"], string> = {
  turmeric: "bg-turmeric-soft",
  chilli: "bg-chilli-soft",
  leaf: "bg-leaf-soft",
  tamarind: "bg-tamarind-soft",
  coconut: "bg-coconut-soft",
};

export function Dots({ n, of = 3, label }: { n: number; of?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${label} ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`h-[5px] w-[5px] rounded-full ${i < n ? "bg-ink" : "bg-line-2"}`} />
      ))}
    </span>
  );
}

export function RecipeCard({ recipe, index }: { recipe: Recipe; index?: number }) {
  const marks = useMarks();
  const starred = isMarked(marks, "star", recipe.id);
  const region = recipe.region === "indo_chinese" ? "Indo-Chinese" : recipe.cuisine === "kerala" ? "Kerala" : recipe.cuisine === "tamil" ? "Tamil" : REGION_LABEL[recipe.region].split(" ")[0];
  return (
    <div className="relative border-t border-line first:border-t-0">
      <Link href={`/recipe/${recipe.id}`} className="press group flex items-stretch gap-4 py-4 pr-9">
        <div className={`relative grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[22px] ${HUE_BG[recipe.hue]}`}>
          <DishArt recipe={recipe} className="h-[84px] w-[84px] transition-transform duration-500 group-hover:rotate-[8deg]" />
          {recipe.kidFriendly && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold text-leaf">Kids</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <p className="eyebrow text-ink-3">
              {region} · {recipe.course === "main" ? "curry" : recipe.course}
            </p>
            <h3 className="font-display mt-1 text-[25px] leading-[1.02] text-ink">{recipe.name}</h3>
            {recipe.native && <p className="mt-0.5 truncate text-[13px] italic text-ink-3">{recipe.native}</p>}
          </div>
          <div className="mt-2 flex items-center gap-3 whitespace-nowrap text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1 tnum">
              <Clock size={13} /> {totalMinutes(recipe)}m
            </span>
            <span className="inline-flex items-center gap-1">
              Level <Dots n={recipe.level} label="Level" />
            </span>
            <span className="inline-flex items-center gap-1">
              Heat <Dots n={recipe.spice} label="Spice" />
            </span>
          </div>
        </div>
      </Link>
      <button
        onClick={() => toggleMark("star", recipe.id)}
        aria-label={starred ? `Unstar ${recipe.name}` : `Star ${recipe.name}`}
        aria-pressed={starred}
        className={`press absolute right-0 top-4 grid h-9 w-9 place-items-center rounded-full ${starred ? "text-turmeric" : "text-ink-3"}`}
      >
        <Star size={20} filled={starred} />
      </button>
      {index !== undefined && <span className="eyebrow pointer-events-none absolute bottom-4 right-1 text-ink-3 tnum">{String(index + 1).padStart(2, "0")}</span>}
    </div>
  );
}
