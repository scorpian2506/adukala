"use client";

import { useEffect } from "react";
import { refreshAccount, syncNow } from "@/lib/account";
import { onSharedChange } from "@/lib/store";

/** Mounted once: signs in from the cookie, then keeps the household's data in sync. */
export function SyncAgent() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);
  return null;
}
