const retiredGamingTerms = [
  "pubg",
  "mech arena",
  "mobile gaming",
  "gaming clan",
  "gaming squad",
  "video game",
  "esports",
  "e-sports"
];

export function containsRetiredGamingContent(...values: Array<string | null | undefined>) {
  const searchable = values.filter(Boolean).join(" ").toLowerCase();
  return retiredGamingTerms.some((term) => searchable.includes(term));
}

export function isRetiredGamingChallenge(challenge: {
  lane?: string | null;
  rules?: string | null;
  sport_type?: string | null;
  title?: string | null;
}) {
  return (
    challenge.lane === "Mobile gaming challenge" ||
    containsRetiredGamingContent(challenge.title, challenge.sport_type, challenge.rules)
  );
}

