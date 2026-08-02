import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const productionUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.jointalent7.com";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: {
    default: "Talent7",
    template: "%s | Talent7"
  },
  applicationName: "Talent7",
  description:
    "Talent7 is a global challenge platform for talent battles, sports matchups, mobile gaming rooms, coaching, public ratings, proof uploads, and verified expert guidance.",
  keywords: [
    "Talent7",
    "talent challenges",
    "sports challenges",
    "mobile gaming challenges",
    "breakdance battles",
    "badminton challenges",
    "coaching",
    "public ratings",
    "proof based competitions"
  ],
  authors: [{ name: "Talent7" }],
  creator: "Talent7",
  publisher: "Talent7",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  openGraph: {
    title: "Talent7",
    description:
      "Join proof-based talent, sports, and mobile gaming challenges with public 7-star ratings, victory proof, teams, coaching, and expert guidance.",
    url: productionUrl,
    siteName: "Talent7",
    type: "website",
    images: [
      {
        url: "/talent7-hero.png",
        width: 1798,
        height: 875,
        alt: "Talent7 proof-based challenge rooms"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Talent7",
    description:
      "Proof-based talent, sports, and gaming challenges with public ratings, teams, coaching, and expert guidance.",
    images: ["/talent7-hero.png"]
  },
  icons: {
    icon: "/talent7-icon.svg",
    shortcut: "/talent7-icon.svg",
    apple: "/talent7-icon.svg"
  },
  category: "sports"
};

export const viewport: Viewport = {
  themeColor: "#141719"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
