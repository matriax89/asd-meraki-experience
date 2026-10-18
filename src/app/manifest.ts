import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Meraki",
    short_name: "Meraki",
    description: "Scopri gli eventi Meraki e acquista il tuo biglietto digitale.",
    lang: "it",
    start_url: "/it/eventi",
    scope: "/",
    display: "standalone",
    background_color: "#f5f4f0",
    theme_color: "#f5f4f0",
    shortcuts: [
      { name: "Scopri gli eventi", short_name: "Eventi", url: "/it/eventi", icons: [{ src: "/icons/meraki-192.png", sizes: "192x192" }] },
      { name: "I miei biglietti", short_name: "Biglietti", url: "/it/biglietti", icons: [{ src: "/icons/meraki-192.png", sizes: "192x192" }] },
    ],
    categories: ["entertainment", "sports"],
    icons: [
      {
        src: "/icons/meraki-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/meraki-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/meraki-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
