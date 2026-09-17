import { timingSafeEqual } from "node:crypto";

export function verifyWebhookToken(header, secret) {
  if (typeof secret !== "string" || !secret.trim() || typeof header !== "string") return false;
  const token = header.replace(/^Apikey\s+/i, "").trim();
  const actual = Buffer.from(token);
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
