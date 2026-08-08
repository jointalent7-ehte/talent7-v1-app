import { createHash, createHmac } from "node:crypto";

export type R2MediaKind = "challenge-proofs" | "showcase-media";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
};

type PresignedRequest = {
  method: "PUT" | "DELETE";
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
};

function requiredEnvironmentValue(name: string) {
  return process.env[name]?.trim() || "";
}

export function getR2Config(): R2Config | null {
  const config = {
    accountId: requiredEnvironmentValue("R2_ACCOUNT_ID"),
    accessKeyId: requiredEnvironmentValue("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironmentValue("R2_SECRET_ACCESS_KEY"),
    bucketName: requiredEnvironmentValue("R2_BUCKET_NAME"),
    publicBaseUrl: requiredEnvironmentValue("R2_PUBLIC_BASE_URL").replace(/\/+$/, "")
  };

  if (Object.values(config).some((value) => !value)) return null;

  try {
    const publicUrl = new URL(config.publicBaseUrl);
    if (publicUrl.protocol !== "https:" && publicUrl.hostname !== "localhost") return null;
  } catch {
    return null;
  }

  return config;
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalObjectPath(bucketName: string, key: string) {
  return `/${[bucketName, ...key.split("/")].map(encodeRfc3986).join("/")}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function canonicalQuery(parameters: Record<string, string>) {
  return Object.entries(parameters)
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function createR2PresignedUrl({
  method,
  key,
  contentType,
  expiresInSeconds = 300
}: PresignedRequest) {
  const config = getR2Config();
  if (!config) throw new Error("Cloudflare R2 is not configured.");
  if (expiresInSeconds < 1 || expiresInSeconds > 604800) throw new Error("Invalid R2 URL expiry.");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const requestType = "aws4_request";
  const credentialScope = `${date}/${region}/${service}/${requestType}`;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = canonicalObjectPath(config.bucketName, key);
  const normalizedContentType = contentType?.trim().toLowerCase();
  const signedHeaders = normalizedContentType ? "content-type;host" : "host";
  const canonicalHeaders = normalizedContentType
    ? `content-type:${normalizedContentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const parameters: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders
  };
  const query = canonicalQuery(parameters);
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, requestType);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

export function publicR2Url(key: string) {
  const config = getR2Config();
  if (!config) throw new Error("Cloudflare R2 is not configured.");
  return `${config.publicBaseUrl}/${key.split("/").map(encodeRfc3986).join("/")}`;
}

export function r2KeyFromPublicUrl(mediaUrl: string) {
  const config = getR2Config();
  if (!config) return null;

  try {
    const base = new URL(`${config.publicBaseUrl}/`);
    const media = new URL(mediaUrl);
    if (base.origin !== media.origin || !media.pathname.startsWith(base.pathname)) return null;

    const encodedKey = media.pathname.slice(base.pathname.length);
    const key = encodedKey
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return key || null;
  } catch {
    return null;
  }
}
