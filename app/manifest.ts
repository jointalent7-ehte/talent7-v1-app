import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talent7",
    short_name: "Talent7",
    description: "Proof-based talent, sports, and gaming challenge rooms.",
    start_url: "/#rooms",
    scope: "/",
    display: "standalone",
    background_color: "#fbfcfb",
    theme_color: "#141719",
    categories: ["sports", "social", "entertainment"],
    icons: [
      {
        src: "/talent7-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
