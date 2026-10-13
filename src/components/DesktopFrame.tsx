"use client";

import { Suspense, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Logo } from "./Logo";
import { NavTracker } from "./Nav";
import { SyncAgent } from "./SyncAgent";

// Adukala is a phone product. On a wide screen we present the app inside a
// device-sized column and offer a QR code to move to the phone.
export function DesktopFrame({ children }: { children: React.ReactNode }) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    const url = window.location.origin;
    QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1c1813", light: "#00000000" } })
      .then(setQr)
      .catch(() => {});
  }, []);

  return (
    <div className="relative z-10 lg:grid lg:min-h-dvh lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-10 lg:px-10">
      <aside className="hidden lg:flex lg:flex-col lg:justify-between lg:self-stretch lg:py-12">
        <Logo className="text-[34px]" />
        <div className="max-w-[440px]">
          <p className="eyebrow text-ink-3">Measured Indian cooking</p>
          <h1 className="font-display mt-4 text-[64px] leading-[0.95] text-ink">
            Cook it right <em className="text-chilli">the first time.</em>
          </h1>
          <p className="mt-6 max-w-[360px] text-[15px] leading-relaxed text-ink-2">
            Every gram measured. Every stir timed. One step on screen until you tap next. Made for
            your phone, propped up beside the stove.
          </p>
        </div>
        <p className="eyebrow text-ink-3">North · South · From any YouTube recipe</p>
      </aside>

      <div className="app-frame relative mx-auto w-full lg:w-[420px] lg:overflow-hidden lg:rounded-[40px] lg:border lg:border-line-2 lg:bg-paper lg:shadow-[0_40px_80px_-30px_rgba(28,24,19,.45),0_0_0_10px_#1c1813]">
        <div className="app-scroll lg:h-[var(--frame-h)] lg:overflow-y-auto no-scrollbar">
          <Suspense fallback={null}>
            <NavTracker />
          </Suspense>
          <SyncAgent />
          {children}
        </div>
      </div>

      <aside className="hidden lg:flex lg:flex-col lg:items-start lg:justify-end lg:self-stretch lg:py-12">
        <div className="rounded-3xl border border-line-2 bg-card p-6">
          <div className="h-[132px] w-[132px] [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="font-display mt-5 text-[26px] leading-none">Open on your phone</p>
          <p className="mt-2 max-w-[200px] text-[13px] leading-snug text-ink-2">
            Scan with your camera. Add to home screen and it works like an app.
          </p>
        </div>
      </aside>
    </div>
  );
}
