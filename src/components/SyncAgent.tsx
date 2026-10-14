"use client";

import { useEffect } from "react";
import { refreshAccount, syncNow } from "@/lib/account";
import { onSharedChange } from "@/lib/store";

/** How often an open app pulls the household's changes (a dish or child someone else added). */
export const POLL_MS = 10_000;

/** Mounted once: signs in from the cookie, then keeps the household's data in sync. */
export function SyncAgent() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ticks = 0;
    // While the app is open, keep pulling so everyone sees the same plan and family without reloading.
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks++;
      // Now and then re-read the household too (someone new may have joined).
      if (ticks % 6 === 0) void refreshAccount().then(() => syncNow());
      else void syncNow();
    }, POLL_MS);
    void refreshAccount().then(() => syncNow());
    const off = onSharedChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 1200);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      off();
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);
  return null;
}
