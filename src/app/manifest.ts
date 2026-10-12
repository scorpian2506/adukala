import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adukala — measured Indian cooking",
    short_name: "Adukala",
    description: "Cook North and South Indian dishes exactly right, one measured step at a time.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4ede1",
    theme_color: "#f4ede1",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
