# Talent7 payment-provider review brief

Use this document before enabling any website payment provider. Approval must cover the same product customers will actually use.

## Merchant and audience

- Merchant location: India.
- Current entity type: individual/unregistered merchant unless updated during onboarding.
- Customer audience: worldwide, including India.
- Settlement requirement: an Indian bank account.
- Desired coverage: Indian UPI/cards plus international cards and major currencies.

## Complete current product description

Talent7 is a proof-based worldwide talent-and-sports competition platform. Users can create, discover, invite others to, join, and complete talent or sports challenges. Participants can upload proof, receive public votes and 7-star ratings, use teams and profiles, communicate in challenge rooms, and broadcast challenge activity using LiveKit.

Listen rooms and gaming categories have been permanently retired. Challenge participation is free. Talent7 has no paid entry, stake, wager, betting, fantasy contest, chance-based reward, cash prize, withdrawable balance, stored-value wallet, peer-to-peer payment, user fundraising, or payout to challengers, winners, creators, teams, or other users.

## Paid digital products

Customers may buy one of three optional fixed-price digital profile badges:

| Product | Fixed price | Delivery |
| --- | ---: | --- |
| Supporter | ₹99 | Permanent Supporter profile badge |
| Champion Supporter | ₹299 | Permanent Champion Supporter profile badge |
| Founder Supporter | ₹999 | Permanent Founder Supporter profile badge |

Each payment has a defined digital product and fixed price. There is no customer-entered or variable payment amount. Website payments settle only to the Talent7 operator. Android uses Google Play Billing for the same three products.

Badge purchases are separate from challenges and provide no entry, ranking, voting, prize, competitive, investment, or ownership advantage.

## Written questions for Razorpay

1. Is this complete current business model eligible, including free talent and sports challenges with no monetary stakes or prizes?
2. Is the model eligible for an India-based individual/unregistered merchant? If not, what exact entity registration is required?
3. Are the three fixed-price digital badge products permitted?
4. Which merchant category code and line of business would you assign?
5. Is an RNG certificate or legal opinion required when Talent7 does not use random outcomes, paid entry, gambling, or prizes?
6. Can the account accept Indian UPI/cards and international cards from a worldwide audience? Which currencies can be presented and how are funds settled in India?
7. What KYC, business proof, tax, export, website-policy, and customer-support documents are required?
8. Please confirm approval in writing before live website checkout is enabled.

## Release rule

Keep both values `false` until written approval and a verified production integration exist:

```text
WEBSITE_PAYMENTS_ENABLED=false
NEXT_PUBLIC_WEBSITE_PAYMENTS_ENABLED=false
```

The server switch prevents order creation even if a browser is modified. Enabling only the public switch must never be treated as payment authorization.
