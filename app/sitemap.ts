import type { MetadataRoute } from "next";

const productionUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.jointalent7.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/support", "/child-safety", "/delete-account"];

  return routes.map((route) => ({
    url: `${productionUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "monthly",
    priority: route === "" ? 1 : 0.6
  }));
}
