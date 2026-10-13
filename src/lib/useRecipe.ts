"use client";

import { useSyncExternalStore } from "react";
import { findRecipe } from "./recipes";
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
  const recipe = findRecipe(id, saved);
  // Render only after hydration: recipes, progress and settings live in localStorage.
  return { recipe: hydrated ? recipe : undefined, ready: hydrated };
}
