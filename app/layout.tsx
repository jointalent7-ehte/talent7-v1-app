import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jointalent7.com"),
  title: {
    default: "Talent7",
    template: "%s | Talent7"
  },
  applicationName: "Talent7",
  description:
    "Talent7 is a global challenge platform for talent battles, sports matchups, mobile gaming rooms, coaching, public ratings, proof uploads, and future live expert help.",
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
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Talent7",
    description:
      "Join proof-based talent, sports, and mobile gaming challenges with public 7-star ratings, victory proof, teams, coaching, and future live battles.",
    url: "https://jointalent7.com",
    siteName: "Talent7",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Talent7",
    description:
      "Proof-based talent, sports, and gaming challenges with public ratings, teams, coaching, and future live battles."
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23141719'/%3E%3Cpath d='M34 8 18 36h13l-3 20 18-31H33l1-17Z' fill='%23f2bd45'/%3E%3C/svg%3E"
      }
    ],
    apple: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='38' fill='%23141719'/%3E%3Cpath d='M96 22 50 102h37l-9 56 52-89H93l3-47Z' fill='%23f2bd45'/%3E%3C/svg%3E"
      }
    ]
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
