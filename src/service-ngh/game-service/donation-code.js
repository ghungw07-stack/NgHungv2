import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createShortDonationCode() {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `NGH${suffix}`;
}
