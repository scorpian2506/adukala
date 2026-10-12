import Link from "next/link";
import { StepArt } from "./StepArt";

export function Loading() {
  return (
    <div className="app-h grid place-items-center">
      <StepArt kind="stir" className="h-24 w-28 opacity-60" />
    </div>
  );
}

export function NotFound() {
  return (
    <div className="app-h flex flex-col items-center justify-center px-8 text-center">
      <StepArt kind="serve" hue="coconut" className="h-32 w-40" />
      <h1 className="font-display mt-4 text-[36px] leading-none">Recipe not found</h1>
      <p className="mt-2 text-[14px] text-ink-2">It may have been deleted, or it was saved on another phone.</p>
      <Link href="/" className="press mt-6 rounded-full bg-ink px-5 py-3 text-[14px] font-medium text-paper">
        Back to the kitchen
      </Link>
    </div>
  );
}
