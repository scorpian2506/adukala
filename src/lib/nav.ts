"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

// Tracks in-app navigations so "Back" can fall back to Home when a page was
// opened directly (from a shared link or the home-screen icon).
let inAppNavigations = 0;
export function noteNavigation() {
  inAppNavigations++;
}

export function useSmartBack(fallback = "/") {
  const router = useRouter();
  return useCallback(() => {
    if (inAppNavigations > 1 && window.history.length > 1) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
