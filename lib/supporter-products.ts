export type SupporterTier = "Supporter" | "Champion Supporter" | "Founder Supporter";

export type SupporterProduct = {
  code: string;
  name: string;
  tier: SupporterTier;
  amountSubunits: number;
  currency: "INR";
  googlePlayProductId: string;
  description: string;
};

export const supporterProducts: readonly SupporterProduct[] = [
  {
    code: "supporter_99",
    name: "Supporter",
    tier: "Supporter",
    amountSubunits: 9_900,
    currency: "INR",
    googlePlayProductId: "talent7_supporter_99",
    description: "A permanent Supporter badge, profile frame, and Listen-room flair."
  },
  {
    code: "champion_supporter_299",
    name: "Champion Supporter",
    tier: "Champion Supporter",
    amountSubunits: 29_900,
    currency: "INR",
    googlePlayProductId: "talent7_champion_supporter_299",
    description: "A permanent Champion Supporter badge, profile frame, and Listen-room flair."
  },
  {
    code: "founder_supporter_999",
    name: "Founder Supporter",
    tier: "Founder Supporter",
    amountSubunits: 99_900,
    currency: "INR",
    googlePlayProductId: "talent7_founder_supporter_999",
    description: "A permanent Founder Supporter badge, profile frame, and Listen-room flair."
  }
] as const;

export function supporterProductByCode(code: string) {
  return supporterProducts.find((product) => product.code === code) || null;
}

export function supporterProductByGooglePlayId(productId: string) {
  return supporterProducts.find((product) => product.googlePlayProductId === productId) || null;
}

export function supporterTierLabel(tier: SupporterTier) {
  return tier;
}

export function formatInrSubunits(amountSubunits: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amountSubunits / 100);
}
