# Talent7 payment-provider review brief

Use this document before integrating or enabling any new website payment provider. Do not remove, rename, or hide active features for a provider review. Approval must cover the same product that customers will use.

## Merchant and audience

- Merchant location: India.
- Current entity type: individual/unregistered merchant unless updated during onboarding.
- Customer audience: worldwide, including India.
- Settlement requirement: an Indian bank account.
- Desired coverage: Indian UPI/cards plus international cards and major currencies.

## Complete Talent7 product description

Talent7 is a proof-based worldwide community challenge platform. Users can create, discover, invite others to, join, and complete talent, sports, and mobile-gaming challenges. Participants can upload proof, receive public votes and 7-star ratings, use teams and profiles, communicate in rooms, and broadcast challenge activity using LiveKit. Talent7 also has public/private Listen rooms where users share links to songs hosted by third-party music services; Talent7 does not store or rebroadcast those songs.

Challenge participation is free. Talent7 has no paid entry, stake, wager, betting, fantasy contest, chance-based reward, cash prize, withdrawable balance, stored-value wallet, peer-to-peer payment, user fundraising, or payout to challengers, winners, creators, teams, or other users.

## Proposed paid products

Website customers may make an optional one-time purchase directly from Talent7:

| Product | Amount | Delivery |
| --- | ---: | --- |
| Supporter | ₹99 | Permanent Supporter profile badge |
| Champion Supporter | ₹299 | Permanent Champion Supporter profile badge |
| Founder Supporter | ₹999 | Permanent Founder Supporter profile badge |
| Custom platform support | ₹10–₹100,000 | Highest qualifying badge at ₹99, ₹299, or ₹999; lower amounts receive no badge |

Custom support is a voluntary contribution to operating Talent7. It is not a tax-deductible charitable donation, investment, challenge fee, payment to another user, crowdfunding campaign, or marketplace collection. All website payments settle only to the Talent7 operator.

Android uses Google Play Billing for the three fixed digital products. The custom amount is website-only.

## Written questions for the provider

1. Is this complete business model eligible, including free mobile-gaming challenges with no monetary stakes or prizes?
2. Is the model eligible for an India-based individual/unregistered merchant? If not, what exact entity registration is required?
3. Are the three fixed digital supporter products permitted?
4. Is the optional customer-entered custom support amount permitted when it settles only to Talent7 and is not charitable fundraising?
5. Which merchant category code and line of business would you assign?
6. Do the words `challenge`, `mobile gaming`, `community`, or `support` trigger additional review even with the financial exclusions above?
7. Is an RNG certificate or legal opinion required when Talent7 does not use random outcomes, paid entry, gambling, or prizes?
8. Can the account accept Indian UPI/cards and international cards from a worldwide audience? Which currencies can be presented and how are funds settled in India?
9. What KYC, business proof, tax, export, website-policy, and customer-support documents are required?
10. Please confirm approval in writing before API integration begins.

## Provider order of approach

1. Cashfree: first review candidate because it supports Indian onboarding and international payment acceptance; request explicit review of the challenge and custom-support model.
2. PayPal Business: possible international fallback; request product and custom-support approval before relying on it.
3. Paddle: evaluate only for the fixed digital products; ask whether Talent7 qualifies as a supported digital-product business and whether an India-based supplier is accepted.
4. Stripe: consider only if Talent7 receives an India invitation and written business approval.

Dodo Payments is not a suitable candidate under its published restrictions on gaming environments, donations, and contribution models without defined delivery.

## Release rule

Keep both of these values `false` until written approval and a verified production integration exist:

```text
WEBSITE_PAYMENTS_ENABLED=false
NEXT_PUBLIC_WEBSITE_PAYMENTS_ENABLED=false
```

The server switch prevents order creation even if a browser is modified. Enabling only the public switch must never be treated as payment authorization.
