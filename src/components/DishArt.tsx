import type { Recipe } from "@/lib/types";

const FILL: Record<Recipe["hue"], [string, string]> = {
  turmeric: ["var(--turmeric)", "var(--turmeric-soft)"],
  chilli: ["var(--chilli)", "var(--chilli-soft)"],
  leaf: ["var(--leaf)", "var(--leaf-soft)"],
  tamarind: ["var(--tamarind)", "var(--tamarind-soft)"],
  coconut: ["var(--coconut)", "var(--coconut-soft)"],
};

// Deterministic pseudo-random so each dish gets its own garnish pattern.
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const INK = "var(--ink)";

// Trig can differ in the last bit between server and browser; round so hydration matches.
const r2 = (n: number) => Math.round(n * 100) / 100;

export function DishArt({ recipe, className = "" }: { recipe: Pick<Recipe, "id" | "hue" | "course">; className?: string }) {
  const [strong, soft] = FILL[recipe.hue];
  const rand = rng(recipe.id);
  const garnish = Array.from({ length: 9 }, () => ({
    a: rand() * Math.PI * 2,
    r: 8 + rand() * 22,
    s: 1.6 + rand() * 2.2,
    leaf: rand() > 0.6,
  }));

  if (recipe.course === "drink") {
    return (
      <svg viewBox="0 0 120 120" className={className} aria-hidden>
        <path d="M34 44 h48 l-5 50 q-1 8 -9 8 h-20 q-8 0 -9 -8 z" fill="var(--card)" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        <path d="M37 56 h42 l-3.6 36 q-1 6 -7 6 h-20.8 q-6 0 -7 -6 z" fill={soft} />
        <path d="M82 54 q14 0 14 14 q0 12 -16 12" fill="none" stroke={INK} strokeWidth={2.2} />
        {[48, 58, 68].map((x, i) => (
          <path key={x} d={`M${x} 36 q-5 -7 0 -13 q5 -6 0 -12`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} style={{ animation: `steam 2.6s ease-in-out ${i * 0.7}s infinite`, transformBox: "fill-box", transformOrigin: "bottom" }} />
        ))}
      </svg>
    );
  }

  const isRice = recipe.course === "rice" || recipe.course === "breakfast";
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="62" r="46" fill="var(--card)" stroke={INK} strokeWidth={2.2} />
      <circle cx="60" cy="62" r="38" fill="none" stroke={INK} strokeWidth={1} opacity={0.25} />
      {isRice ? (
        <g>
          <path d="M28 66 Q30 34 60 32 Q90 34 92 66 Q60 80 28 66 Z" fill={soft} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          {Array.from({ length: 22 }, (_, i) => {
            const x = r2(36 + rand() * 48);
            const y = r2(42 + rand() * 24);
            return <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.2} transform={`rotate(${r2(rand() * 180)} ${x} ${y})`} fill="var(--card)" opacity={0.9} />;
          })}
        </g>
      ) : (
        <g>
          <circle cx="60" cy="62" r="30" fill={strong} stroke={INK} strokeWidth={2} />
          <path d="M44 60 q8 -10 16 -2 t16 -2" fill="none" stroke={soft} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
          <path d="M46 72 q10 -6 18 0 t12 -2" fill="none" stroke={soft} strokeWidth={1.8} strokeLinecap="round" opacity={0.6} />
        </g>
      )}
      {garnish.map((g, i) => {
        const x = r2(60 + Math.cos(g.a) * g.r);
        const y = r2(60 + Math.sin(g.a) * g.r * 0.8);
        const s = r2(g.s * 0.7);
        return g.leaf ? (
          <path key={i} d={`M${x} ${y} q3 -5 8 -3 q-3 5 -8 3z`} fill="var(--leaf)" />
        ) : (
          <circle key={i} cx={x} cy={y} r={s} fill={isRice ? strong : "var(--card)"} opacity={0.85} />
        );
      })}
    </svg>
  );
}
