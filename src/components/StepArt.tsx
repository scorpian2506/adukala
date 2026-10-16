import type { CSSProperties, ReactNode } from "react";
import type { Equipment, Flame, Hue, StepKind } from "@/lib/types";

// Hand-drawn, looping line illustrations — one scene per step kind.
// Everything is SVG + CSS keyframes so it stays crisp and weighs nothing.

const INK = "var(--ink)";
const SW = 2.4;

const HUE_FILL: Record<Hue, [string, string]> = {
  turmeric: ["var(--turmeric)", "var(--turmeric-soft)"],
  chilli: ["var(--chilli)", "var(--chilli-soft)"],
  leaf: ["var(--leaf)", "var(--leaf-soft)"],
  tamarind: ["var(--tamarind)", "var(--tamarind-soft)"],
  coconut: ["var(--coconut)", "var(--coconut-soft)"],
};

function anim(name: string, dur: number, extra: CSSProperties = {}, origin = "center"): CSSProperties {
  return {
    animation: `${name} ${dur}s ease-in-out infinite`,
    transformBox: "fill-box",
    transformOrigin: origin,
    ...extra,
  };
}

function Burner({ flame = "medium" }: { flame?: Flame }) {
  const n = flame === "off" ? 0 : flame === "low" ? 3 : flame === "medium" ? 5 : 7;
  const h = flame === "low" ? 7 : flame === "medium" ? 11 : 15;
  const xs = Array.from({ length: n }, (_, i) => 100 + (i - (n - 1) / 2) * 11);
  return (
    <g>
      {xs.map((x, i) => (
        <path
          key={i}
          d={`M${x - 4} 140 Q${x - 4} ${140 - h * 0.6} ${x} ${140 - h} Q${x + 4} ${140 - h * 0.6} ${x + 4} 140 Z`}
          fill="var(--chilli)"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinejoin="round"
          style={anim("flicker", 0.5 + (i % 3) * 0.13, { animationDelay: `${i * 0.07}s` }, "bottom")}
        />
      ))}
      <rect x="52" y="140" width="96" height="7" rx="3.5" fill="var(--paper-3)" stroke={INK} strokeWidth={SW} />
    </g>
  );
}

function Steam({ x = 100, y = 52, count = 3 }: { x?: number; y?: number; count?: number }) {
  return (
    <g fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" opacity={0.7}>
      {Array.from({ length: count }, (_, i) => {
        const dx = (i - (count - 1) / 2) * 16;
        return (
          <path
            key={i}
            d={`M${x + dx} ${y} q-6 -8 0 -16 q6 -8 0 -16`}
            style={anim("steam", 2.4, { animationDelay: `${i * 0.6}s` }, "bottom")}
          />
        );
      })}
    </g>
  );
}

function Kadai({ fill, children }: { fill: string; children?: ReactNode }) {
  return (
    <g>
      <path d="M44 96 H156 Q152 134 100 136 Q48 134 44 96 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M52 104 H148 Q142 128 100 129 Q58 128 52 104 Z" fill={fill} opacity={0.9} />
      {children}
      <path d="M44 96 q-14 -2 -16 8 M156 96 q14 -2 16 8" fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
      <line x1="40" y1="96" x2="160" y2="96" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
    </g>
  );
}

function Cooker({ fill, whistle = true, whistleAnim = false, lid = true }: { fill: string; whistle?: boolean; whistleAnim?: boolean; lid?: boolean }) {
  return (
    <g>
      <rect x="58" y="78" width="84" height="60" rx="10" fill="var(--paper-2)" stroke={INK} strokeWidth={SW} />
      <path d="M62 104 H138" stroke={INK} strokeWidth={1.2} opacity={0.35} />
      <rect x="64" y="108" width="72" height="24" rx="6" fill={fill} opacity={0.35} />
      <path d="M142 90 H182 q6 0 6 6 v0 q0 6 -6 6 H142" fill="var(--ink)" stroke={INK} strokeWidth={SW} />
      {lid && (
        <g>
          <path d="M54 78 Q100 56 146 78 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M146 72 H176 q5 0 5 5 q0 5 -5 5 H146" fill="var(--ink)" />
          {whistle && (
            <g style={whistleAnim ? anim("jiggle", 0.35, {}, "bottom") : undefined}>
              <rect x="95" y="54" width="10" height="12" rx="2" fill="var(--ink)" />
              <circle cx="100" cy="51" r="5" fill="var(--ink)" />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

function Spoon({ x, y, rot = 0, style }: { x: number; y: number; rot?: number; style?: CSSProperties }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <g style={style}>
        <line x1="0" y1="0" x2="46" y2="0" stroke={INK} strokeWidth={SW + 0.6} strokeLinecap="round" />
        <ellipse cx="-8" cy="0" rx="11" ry="7" fill="var(--card)" stroke={INK} strokeWidth={SW} />
      </g>
    </g>
  );
}

function Bowl({ fill, x = 100, y = 120, w = 70 }: { fill: string; x?: number; y?: number; w?: number }) {
  const h = w * 0.42;
  return (
    <g>
      <path
        d={`M${x - w / 2} ${y} H${x + w / 2} Q${x + w / 2 - 4} ${y + h} ${x} ${y + h} Q${x - w / 2 + 4} ${y + h} ${x - w / 2} ${y} Z`}
        fill="var(--card)"
        stroke={INK}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <ellipse cx={x} cy={y} rx={w / 2 - 3} ry={4} fill={fill} />
    </g>
  );
}

function Particles({ fill, x = 100, y = 64 }: { fill: string; x?: number; y?: number }) {
  return (
    <g>
      {[-10, -2, 6, 13, -6, 2].map((dx, i) => (
        <circle
          key={i}
          cx={x + dx}
          cy={y + (i % 2) * 4}
          r={i % 3 === 0 ? 2.8 : 2.1}
          fill={fill}
          stroke={INK}
          strokeWidth={0.8}
          style={anim("drop", 1.4, { animationDelay: `${i * 0.18}s`, animationTimingFunction: "ease-in" })}
        />
      ))}
    </g>
  );
}

function Scene({ kind, flame, equipment, hue, offStove }: { kind: StepKind; flame?: Flame; equipment?: Equipment; hue: Hue; offStove?: boolean }) {
  const [strong, soft] = HUE_FILL[hue];
  const usesCooker = equipment === "pressure_cooker";

  // Baking: the oven, glowing while it's on.
  if (equipment === "oven") {
    const on = kind !== "note";
    return (
      <g>
        <rect x="46" y="30" width="108" height="112" rx="12" fill="var(--card)" stroke={INK} strokeWidth={SW} />
        <line x1="46" y1="52" x2="154" y2="52" stroke={INK} strokeWidth={SW} />
        {[66, 84, 102].map((x) => (
          <circle key={x} cx={x} cy={41} r={4} fill="var(--paper-2)" stroke={INK} strokeWidth={1.6} />
        ))}
        <circle cx={136} cy={41} r={3} fill={on ? "var(--chilli)" : "var(--line-2)"} style={on ? anim("bob", 1.4) : undefined} />
        <rect x="60" y="64" width="80" height="62" rx="8" fill={on ? soft : "var(--paper-2)"} stroke={INK} strokeWidth={SW} />
        <line x1="66" y1="60" x2="134" y2="60" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <rect x="74" y="98" width="52" height="16" rx="4" fill={strong} stroke={INK} strokeWidth={SW} style={kind === "wait" ? anim("bob", 2.6) : undefined} />
        {on &&
          [80, 100, 120].map((x, i) => (
            <path key={x} d={`M${x} 92 q-4 -6 0 -12 q4 -6 0 -12`} fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" style={anim("bubble", 2.4, { animationDelay: `${i * 0.6}s` })} />
          ))}
      </g>
    );
  }

  // Prep work in a bowl: no stove, no flame.
  if (offStove && (kind === "add" || kind === "stir" || kind === "wait" || kind === "note")) {
    return (
      <g>
        <Bowl fill={soft} x={100} y={108} w={110} />
        {kind === "add" && (
          <>
            <g transform="translate(124 50)">
              <g style={anim("tip", 2, {}, "left")}>
                <Spoon x={0} y={0} rot={0} />
              </g>
            </g>
            <Particles fill={strong} x={110} y={60} />
          </>
        )}
        {kind === "stir" && (
          <g transform="translate(100 112)">
            <g style={{ animation: "stir 1.6s linear infinite" }}>
              <g transform="translate(14 0)">
                <line x1="0" y1="0" x2="20" y2="-70" stroke={INK} strokeWidth={SW + 1} strokeLinecap="round" />
                <ellipse cx="0" cy="0" rx="8" ry="4.5" fill="var(--card)" stroke={INK} strokeWidth={SW} />
              </g>
            </g>
          </g>
        )}
        {kind === "wait" &&
          [80, 100, 120].map((x, i) => (
            <circle key={x} cx={x} cy={110} r={2.6} fill="none" stroke={INK} strokeWidth={1.2} style={anim("bubble", 2.2, { animationDelay: `${i * 0.7}s` })} />
          ))}
        {kind === "note" && <path d="M100 52 v26 M100 88 v3" stroke={INK} strokeWidth={4} strokeLinecap="round" />}
      </g>
    );
  }

  switch (kind) {
    case "measure":
      return (
        <g>
          <Bowl fill={soft} x={66} y={118} w={56} />
          <Bowl fill={strong} x={136} y={118} w={56} />
          <g style={anim("bob", 1.8)}>
            <Spoon x={118} y={62} rot={-24} />
          </g>
          <Particles fill={strong} x={128} y={78} />
        </g>
      );
    case "chop":
      return (
        <g>
          <rect x="34" y="118" width="132" height="20" rx="8" fill="var(--tamarind-soft)" stroke={INK} strokeWidth={SW} />
          <circle cx="152" cy="128" r="3" fill="none" stroke={INK} strokeWidth={1.6} />
          {[56, 70, 84].map((x, i) => (
            <rect key={x} x={x} y={106} width="11" height="12" rx="3" fill={i === 1 ? soft : strong} stroke={INK} strokeWidth={1.6} />
          ))}
          <path d="M100 110 q20 -14 40 0 v8 h-40 z" fill={soft} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <g style={anim("chop", 0.7, {}, "right")}>
            <path d="M96 40 L104 40 L106 104 L84 104 Q86 66 96 40 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <rect x="94" y="16" width="12" height="26" rx="3" fill="var(--ink)" />
          </g>
        </g>
      );
    case "grind":
      return (
        <g>
          <rect x="64" y="118" width="72" height="24" rx="6" fill="var(--paper-2)" stroke={INK} strokeWidth={SW} />
          <circle cx="100" cy="130" r="5" fill="var(--chilli)" stroke={INK} strokeWidth={1.4} />
          <g style={anim("shake", 0.18)}>
            <path d="M72 50 H128 L122 116 H78 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d="M76 80 H124 L121 112 H79 Z" fill={soft} />
            <rect x="68" y="40" width="64" height="12" rx="4" fill="var(--ink)" />
            <path d="M128 64 h12 q6 0 6 6 v20 q0 6 -6 6 h-14" fill="none" stroke={INK} strokeWidth={SW} />
            <g style={{ animation: "spin .35s linear infinite", transformBox: "fill-box", transformOrigin: "center" }}>
              <path d="M86 100 L114 100 M100 92 L100 108" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
            </g>
          </g>
        </g>
      );
    case "rinse":
      return (
        <g>
          <path d="M70 30 h20 v14 h-6 v8" fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d="M84 58 q-3 5 0 7 q3 -2 0 -7z"
              fill="#9cc3d6"
              stroke={INK}
              strokeWidth={1}
              style={anim("drop", 1, { animationDelay: `${i * 0.25}s`, animationTimingFunction: "ease-in" })}
            />
          ))}
          <Bowl fill="#bfd9e3" x={100} y={104} w={92} />
          {[84, 96, 108, 118].map((x, i) => (
            <circle key={x} cx={x} cy={106} r={2.4} fill={strong} style={anim("bob", 1.2, { animationDelay: `${i * 0.2}s` })} />
          ))}
        </g>
      );
    case "soak":
      return (
        <g>
          <path d="M152 30 a16 16 0 1 0 12 26 a12 12 0 1 1 -12 -26z" fill="var(--turmeric-soft)" stroke={INK} strokeWidth={SW} />
          <Bowl fill="#bfd9e3" x={96} y={96} w={104} />
          {[70, 86, 100, 114, 124].map((x) => (
            <circle key={x} cx={x} cy={110} r={4} fill={strong} stroke={INK} strokeWidth={1} />
          ))}
          {[78, 104, 120].map((x, i) => (
            <circle key={x} cx={x} cy={100} r={2.4} fill="none" stroke={INK} strokeWidth={1.2} style={anim("bubble", 2.2, { animationDelay: `${i * 0.7}s` })} />
          ))}
        </g>
      );
    case "heat":
    case "flame":
      return (
        <g>
          {usesCooker ? <Cooker fill={strong} lid={kind === "flame"} /> : <Kadai fill={kind === "heat" ? "var(--turmeric-soft)" : soft} />}
          {kind === "heat" && (
            <g opacity={0.6}>
              {[78, 100, 122].map((x, i) => (
                <path key={x} d={`M${x} 88 q-5 -8 0 -14 q5 -6 0 -12`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" style={anim("steam", 2, { animationDelay: `${i * 0.5}s` }, "bottom")} />
              ))}
            </g>
          )}
          <Burner flame={flame ?? (kind === "heat" ? "medium" : "low")} />
          {kind === "flame" && (
            <g transform="translate(166 42)">
              <circle r="15" fill="var(--card)" stroke={INK} strokeWidth={SW} />
              <g
                style={{
                  transform: `rotate(${flame === "off" ? -90 : flame === "low" ? 60 : flame === "medium" ? 0 : -50}deg)`,
                  transition: "transform .6s",
                }}
              >
                <rect x="-2.5" y="-13" width="5" height="12" rx="2" fill={INK} />
              </g>
            </g>
          )}
        </g>
      );
    case "add":
      return (
        <g>
          {usesCooker ? <Cooker fill={strong} lid={false} /> : <Kadai fill={soft} />}
          <Burner flame={flame ?? "medium"} />
          <g transform="translate(124 50)">
            <g style={anim("tip", 2, {}, "left")}>
              <Spoon x={0} y={0} rot={0} />
            </g>
          </g>
          <Particles fill={strong} x={110} y={60} />
        </g>
      );
    case "stir":
      return (
        <g>
          {usesCooker ? <Cooker fill={strong} lid={false} /> : <Kadai fill={soft} />}
          <Burner flame={flame ?? "medium"} />
          <g transform="translate(100 112)">
            <g style={{ animation: "stir 1.6s linear infinite" }}>
              <g transform="translate(16 0)">
                <line x1="0" y1="0" x2="22" y2="-74" stroke={INK} strokeWidth={SW + 1} strokeLinecap="round" />
                <ellipse cx="0" cy="0" rx="9" ry="5" fill="var(--card)" stroke={INK} strokeWidth={SW} />
              </g>
            </g>
          </g>
          <path d="M70 112 q30 10 60 0" fill="none" stroke={strong} strokeWidth={2} strokeDasharray="4 6" style={{ animation: "marquee 1.6s linear infinite" }} />
        </g>
      );
    case "wait":
      return (
        <g>
          {usesCooker ? <Cooker fill={strong} /> : <Kadai fill={soft} />}
          {!usesCooker &&
            [74, 96, 118, 132].map((x, i) => (
              <circle key={x} cx={x} cy={112} r={3} fill="var(--card)" stroke={INK} strokeWidth={1.2} style={anim("bubble", 1.8, { animationDelay: `${i * 0.45}s` })} />
            ))}
          <Steam y={usesCooker ? 46 : 88} />
          <Burner flame={flame ?? "low"} />
        </g>
      );
    case "lid_close":
    case "lid_open":
      return usesCooker ? (
        <g>
          <Cooker fill={strong} lid={false} />
          <g style={anim(kind === "lid_close" ? "lidDown" : "lidUp", 2.4, { animationIterationCount: "infinite" })}>
            <path d="M54 78 Q100 56 146 78 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <path d="M146 72 H176 q5 0 5 5 q0 5 -5 5 H146" fill="var(--ink)" />
            <rect x="95" y="54" width="10" height="12" rx="2" fill="var(--ink)" />
            <circle cx="100" cy="51" r="5" fill="var(--ink)" />
          </g>
          {kind === "lid_open" && <Steam y={64} />}
          <Burner flame={flame ?? "off"} />
        </g>
      ) : (
        <g>
          <Kadai fill={soft} />
          <g style={anim(kind === "lid_close" ? "lidDown" : "lidUp", 2.4)}>
            <path d="M44 94 Q100 58 156 94 Z" fill="var(--card)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
            <circle cx="100" cy="72" r="5" fill="var(--ink)" />
          </g>
          {kind === "lid_open" && <Steam y={78} />}
          <Burner flame={flame ?? "low"} />
        </g>
      );
    case "pressure":
      return (
        <g>
          <g style={anim("shake", 0.25)}>
            <Cooker fill={strong} whistleAnim />
          </g>
          <g fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round">
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${92 - i * 8} 42 q-10 -8 -6 -20`} style={anim("steam", 1.2, { animationDelay: `${i * 0.25}s` }, "bottom")} />
            ))}
            {[0, 1, 2].map((i) => (
              <path key={`r${i}`} d={`M${108 + i * 8} 42 q10 -8 6 -20`} style={anim("steam", 1.2, { animationDelay: `${i * 0.25 + 0.12}s` }, "bottom")} />
            ))}
          </g>
          <Burner flame={flame ?? "high"} />
        </g>
      );
    case "release":
      return (
        <g>
          <Cooker fill={strong} />
          <g opacity={0.5}>
            <Steam y={44} count={2} />
          </g>
          <Burner flame="off" />
          <g transform="translate(36 52)">
            <circle r="16" fill="var(--card)" stroke={INK} strokeWidth={SW} />
            <g style={{ animation: "spin 6s linear infinite", transformOrigin: "0 0" }}>
              <line x1="0" y1="0" x2="0" y2="-11" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
            </g>
            <circle r="2" fill={INK} />
          </g>
        </g>
      );
    case "serve":
      return (
        <g>
          <ellipse cx="100" cy="124" rx="70" ry="16" fill="var(--card)" stroke={INK} strokeWidth={SW} />
          <ellipse cx="100" cy="120" rx="48" ry="9" fill={soft} />
          <path d="M62 116 Q100 76 138 116 Z" fill={strong} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M92 86 q4 -8 12 -6 q-4 8 -12 6z M104 82 q6 -4 12 0 q-6 6 -12 0z" fill="var(--leaf)" />
          <Steam y={70} />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="100" cy="86" r="34" fill={soft} stroke={INK} strokeWidth={SW} />
          <path d="M100 66 v24 M100 100 v4" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </g>
      );
  }
}

export function StepArt({
  kind,
  flame,
  equipment,
  hue = "turmeric",
  offStove,
  className = "",
}: {
  kind: StepKind;
  flame?: Flame;
  equipment?: Equipment;
  hue?: Hue;
  offStove?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label={`${kind} illustration`}>
      <Scene kind={kind} flame={flame} equipment={equipment} hue={hue} offStove={offStove} />
    </svg>
  );
}
