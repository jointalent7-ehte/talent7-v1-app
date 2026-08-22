import { createSign } from "node:crypto";

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type GooglePlayProductPurchase = {
  acknowledgementState?: number;
  consumptionState?: number;
  kind?: string;
  obfuscatedExternalAccountId?: string;
  orderId?: string;
  priceAmountMicros?: string;
  priceCurrencyCode?: string;
  purchaseState?: number;
  purchaseTimeMillis?: string;
  purchaseType?: number;
  regionCode?: string;
};

const androidPublisherScope = "https://www.googleapis.com/auth/androidpublisher";
const packageName = "com.jointalent7.app";

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function serviceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const decoded = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<GoogleServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed as GoogleServiceAccount;
  } catch {
    return null;
  }
}

async function googleAccessToken() {
  const account = serviceAccount();
  if (!account) throw new Error("Google Play server verification is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: androidPublisherScope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(account.private_key, "base64url")}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    cache: "no-store"
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "Google Play authentication failed.");
  }
  return body.access_token;
}

export async function fetchGooglePlayProductPurchase(productId: string, purchaseToken: string) {
  const accessToken = await googleAccessToken();
  const url = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`
      + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`
  );
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const body = (await response.json()) as GooglePlayProductPurchase & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Google Play could not verify this purchase.");
  return { purchase: body, accessToken };
}

export async function acknowledgeGooglePlayProduct(productId: string, purchaseToken: string, accessToken?: string) {
  const token = accessToken || await googleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`
    + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({}),
    cache: "no-store"
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: { message?: string } };
    throw new Error(body.error?.message || "Google Play could not acknowledge this purchase.");
  }
}
