import { createHash, timingSafeEqual } from "node:crypto";

export function hashPasscode(passcode: string) {
  return createHash("sha256").update(passcode, "utf8").digest("hex");
}

export function verifyPasscode(passcode: string, expectedHash?: string | null) {
  const envPasscode = process.env.UPLOAD_PASSCODE?.trim();
  const configuredHash = expectedHash || (envPasscode ? hashPasscode(envPasscode) : null);
  if (!configuredHash) return false;

  const actual = Buffer.from(hashPasscode(passcode), "hex");
  const expected = Buffer.from(configuredHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
