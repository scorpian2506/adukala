"use client";

import { useSyncExternalStore } from "react";
import { findSeed } from "./recipes";
import { useSavedRecipes } from "./store";
import type { Recipe } from "./types";

const noop = () => () => {};

/** False during SSR and the first client render, true after hydration. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function useRecipe(id: string): { recipe: Recipe | undefined; ready: boolean } {
  const saved = useSavedRecipes();
  const hydrated = useHydrated();
  const recipe = findSeed(id) ?? saved.find((r) => r.id === id);
  // Render only after hydration: recipes, progress and settings live in localStorage.
  return { recipe: hydrated ? recipe : undefined, ready: hydrated };
}
