import type { MetadataRoute } from "next";

const productionUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.jointalent7.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${productionUrl}/sitemap.xml`,
    host: productionUrl
  };
}
