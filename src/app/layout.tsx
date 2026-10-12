import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { DesktopFrame } from "@/components/DesktopFrame";
import "./globals.css";

const serif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const grotesk = Hanken_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adukala — measured Indian cooking, one step at a time",
  description:
    "Cook North and South Indian dishes exactly right, even if you've never cooked. Every quantity measured, every step timed. Turn any YouTube recipe into a guided cook.",
  applicationName: "Adukala",
  appleWebApp: { capable: true, title: "Adukala", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f4ede1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${grotesk.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">
        <DesktopFrame>{children}</DesktopFrame>
      </body>
    </html>
  );
}
