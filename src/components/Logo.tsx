import { MARK, MARK_VIEWBOX } from "./logoMark";
import { Wordmark } from "./Wordmark";

/**
 * The Adukala mark on its own. The rim follows `currentColor`, so it reads as
 * ink on paper and can be flipped to paper on a dark surface via a text colour.
 * Decorative by default; pass `title` when it stands alone and needs a name.
 */
export function LogoMark({
  size = 24,
  className = "",
  title,
}: {
  size?: number | string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: false })}
    >
      <path d={MARK.flame} fill="var(--chilli)" />
      <path d={MARK.core} fill="var(--turmeric)" />
      <rect {...MARK.rim} fill="currentColor" />
      <path d={MARK.bowl} fill="var(--turmeric)" />
    </svg>
  );
}

/**
 * Mark + wordmark lockup. Sized by font-size (e.g. `text-[30px]`): the mark is
 * set in em so it scales with the type. The visible "Adukala" is the name.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.22em] leading-none text-ink ${className}`}>
      <LogoMark size="1.05em" className="-translate-y-[0.04em]" />
      <Wordmark />
    </span>
  );
}
