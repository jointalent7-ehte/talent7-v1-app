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
    name: "Talent7 Badge",
    tier: "Supporter",
    amountSubunits: 9_900,
    currency: "INR",
    googlePlayProductId: "talent7_supporter_99",
    description: "A permanent Talent7 Badge delivered to your profile."
  },
  {
    code: "champion_supporter_299",
    name: "Champion Badge",
    tier: "Champion Supporter",
    amountSubunits: 29_900,
    currency: "INR",
    googlePlayProductId: "talent7_champion_supporter_299",
    description: "A permanent Champion Badge delivered to your profile."
  },
  {
    code: "founder_supporter_999",
    name: "Founder Badge",
    tier: "Founder Supporter",
    amountSubunits: 99_900,
    currency: "INR",
    googlePlayProductId: "talent7_founder_supporter_999",
    description: "A permanent Founder Badge delivered to your profile."
  }
] as const;

export function supporterProductByCode(code: string) {
  return supporterProducts.find((product) => product.code === code) || null;
}

export function supporterProductByGooglePlayId(productId: string) {
  return supporterProducts.find((product) => product.googlePlayProductId === productId) || null;
}

export function supporterTierLabel(tier: SupporterTier) {
  if (tier === "Champion Supporter") return "Champion Badge";
  if (tier === "Founder Supporter") return "Founder Badge";
  return "Talent7 Badge";
}

export function formatInrSubunits(amountSubunits: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amountSubunits / 100);
}
