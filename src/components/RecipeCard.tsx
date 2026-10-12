import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { REGION_LABEL, totalMinutes } from "@/lib/format";
import { DishArt } from "./DishArt";
import { Clock } from "./Icons";

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
  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className="press group flex items-stretch gap-4 border-t border-line py-4 first:border-t-0"
    >
      <div className={`relative grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[22px] ${HUE_BG[recipe.hue]}`}>
        <DishArt recipe={recipe} className="h-[84px] w-[84px] transition-transform duration-500 group-hover:rotate-[8deg]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink-3">
              {REGION_LABEL[recipe.region].split(" ")[0]} · {recipe.course}
            </p>
            {index !== undefined && <span className="eyebrow text-ink-3 tnum">{String(index + 1).padStart(2, "0")}</span>}
          </div>
          <h3 className="font-display mt-1 text-[25px] leading-[1.02] text-ink">{recipe.name}</h3>
          {recipe.native && <p className="mt-0.5 truncate text-[13px] italic text-ink-3">{recipe.native}</p>}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1.5 tnum">
            <Clock size={14} /> {totalMinutes(recipe)} min
          </span>
          <span className="inline-flex items-center gap-1.5">
            Level <Dots n={recipe.level} label="Level" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            Heat <Dots n={recipe.spice} label="Spice" />
          </span>
        </div>
      </div>
    </Link>
  );
}
