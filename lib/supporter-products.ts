export type SupporterTier = "Supporter" | "Champion Supporter" | "Founder Supporter";

export type SupporterProduct = {
  code: string;
  name: SupporterTier;
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
    description: "A permanent Supporter badge on your Talent7 profile."
  },
  {
    code: "champion_supporter_299",
    name: "Champion Supporter",
    tier: "Champion Supporter",
    amountSubunits: 29_900,
    currency: "INR",
    googlePlayProductId: "talent7_champion_supporter_299",
    description: "A permanent Champion Supporter badge on your Talent7 profile."
  },
  {
    code: "founder_supporter_999",
    name: "Founder Supporter",
    tier: "Founder Supporter",
    amountSubunits: 99_900,
    currency: "INR",
    googlePlayProductId: "talent7_founder_supporter_999",
    description: "A permanent Founder Supporter badge on your Talent7 profile."
  }
] as const;

export const customSupportProductCode = "custom_support";
export const customSupportMinimumSubunits = 1_000;
export const customSupportMaximumSubunits = 10_000_000;

export function supporterProductByCode(code: string) {
  return supporterProducts.find((product) => product.code === code) || null;
}

export function supporterProductByGooglePlayId(productId: string) {
  return supporterProducts.find((product) => product.googlePlayProductId === productId) || null;
}

export function supporterTierForCustomAmount(amountSubunits: number): SupporterTier | null {
  if (amountSubunits >= 99_900) return "Founder Supporter";
  if (amountSubunits >= 29_900) return "Champion Supporter";
  if (amountSubunits >= 9_900) return "Supporter";
  return null;
}

export function formatInrSubunits(amountSubunits: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amountSubunits / 100);
}
