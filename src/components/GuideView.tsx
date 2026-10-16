"use client";

import Link from "next/link";
import { useKitchen } from "@/lib/household";
import { flameLabel } from "@/lib/kitchen-tools";
import { StepArt } from "./StepArt";
import { TopBar } from "./Nav";

const MEASURES = [
  { name: "Teaspoon", short: "tsp", ml: "5 ml", tip: "Level it off with the back of a knife. Heaped spoons ruin spice balance.", size: 18 },
  { name: "Tablespoon", short: "tbsp", ml: "15 ml", tip: "Three teaspoons. The big spoon in a measuring set.", size: 28 },
  { name: "Cup", short: "cup", ml: "240 ml", tip: "A standard measuring cup, not a tea cup. Spoon flour or rava in, then level.", size: 46 },
];

const FLAMES = [
  { name: "Low", bars: 1, body: "Small blue flames just around the burner. For tempering spices and slow simmering." },
  { name: "Medium", bars: 2, body: "Flames reach halfway up the burner gap. The default for onions and masala." },
  { name: "High", bars: 3, body: "Full flames, almost touching the pan's edge. For boiling and pressure building." },
];

const SALT = [
  ["¼ tsp", "1.5 g"],
  ["½ tsp", "3 g"],
  ["1 tsp", "6 g"],
  ["1 tbsp", "18 g"],
];

export function GuideView() {
  const tools = useKitchen();
  const induction = tools.hob === "induction";
  return (
    <main className="app-min-h pb-16">
      <header className="px-4 pb-2">
        <TopBar />
      </header>
      <div className="px-5">
        <p className="eyebrow text-ink-3">Kitchen basics</p>
        <h1 className="font-display mt-2 text-[46px] leading-[0.95]">
          Measure like <em className="text-chilli">a pro.</em>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">The only three things you need to know before your first dish.</p>
      </div>

      <section className="mt-8 px-5">
        <h2 className="font-display text-[28px]">Spoons &amp; cups</h2>
        <div className="mt-3 space-y-2">
          {MEASURES.map((m) => (
            <div key={m.short} className="flex items-center gap-4 rounded-[22px] border border-line-2 bg-card p-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-turmeric-soft">
                <span className="rounded-full border-2 border-ink bg-card" style={{ width: m.size, height: m.size }} />
              </div>
              <div className="min-w-0">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[24px] leading-none">{m.name}</span>
                  <span className="font-mono text-[12px] text-ink-3">
                    {m.short} = {m.ml}
                  </span>
                </p>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">{m.tip}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-ink-3">No measuring set? Buy one. It&rsquo;s the single best thing for getting the same taste every time.</p>
      </section>

      <section className="mt-10 px-5">
        <h2 className="font-display text-[28px]">Salt, in grams</h2>
        <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-[22px] border border-line-2 bg-card">
          {SALT.map(([a, b]) => (
            <div key={a} className="border-r border-line p-3 text-center last:border-r-0">
              <p className="font-display text-[22px] leading-none">{a}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-3">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">Fine table salt. Coarse or rock salt is lighter per spoon.</p>
      </section>

      <section className="mt-10 px-5">
        <h2 className="font-display text-[28px]">{induction ? "Heat levels" : "Flame levels"}</h2>
        <p className="mt-1 text-[13px] text-ink-3">
          {induction ? `On your induction hob (1–${tools.hobMax}). ` : "Cooking on induction? "}
          <Link href="/settings" className="underline underline-offset-2">
            {induction ? "Change" : "Set it in Settings"}
          </Link>
        </p>
        <div className="mt-3 space-y-2">
          {FLAMES.map((f) => (
            <div key={f.name} className="flex items-center gap-3 rounded-[22px] border border-line-2 bg-card p-3 pr-4">
              <div className="h-16 w-20 shrink-0 rounded-2xl bg-chilli-soft/50">
                <StepArt kind="flame" flame={f.name.toLowerCase() as "low" | "medium" | "high"} className="h-full w-full" />
              </div>
              <div>
                <p className="font-display text-[22px] leading-none">
                  {f.name}
                  {induction && <span className="ml-2 font-sans text-[14px] font-medium text-chilli">{flameLabel(f.name.toLowerCase() as "low" | "medium" | "high", tools)}</span>}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 px-5">
        <h2 className="font-display text-[28px]">Pressure cooker</h2>
        <div className="mt-3 rounded-[22px] bg-ink p-5 text-paper">
          <div className="mx-auto h-28 w-36 invert">
            <StepArt kind="pressure" equipment="pressure_cooker" className="h-full w-full" />
          </div>
          <ul className="mt-3 space-y-2.5 text-[14px] leading-snug text-paper/85">
            <li>A <strong className="text-paper">whistle</strong> is the loud hiss when the weight on top lifts. Count each one.</li>
            <li>Never fill more than two-thirds. Dal and beans: half.</li>
            <li>After the last whistle, turn off the flame and wait. Opening early is how accidents happen.</li>
            <li>The lid is safe to open when the weight lifts easily and no steam hisses out.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
