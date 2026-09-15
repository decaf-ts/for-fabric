import { randomBytes } from "crypto";
import path from "path";

export function convertToMS(minutes: number): number {
  const base = 60 * 1000;
  return minutes * base;
}

export function capitalize(str: string) {
  return str?.[0]?.toUpperCase() + str?.slice(1) || "";
}

export const STORAGE_DIR_NAME = "storage";
export const SOFTHSM_DIR_NAME = "softhsm";

export function sleep(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function generateMspId(orgName: string): string {
  return `${capitalize(orgName)}MSP`;
}

export function generatePassword(length = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }

  return password;
}

export function generateRandomSecrets(): { [indexer: string]: any } {
  const secretKeys = Object.keys(process.env).filter((el: string) =>
    el.includes("SECRET")
  );

  const secrets = secretKeys.reduce((accum, key, i) => {
    if (process.env[key] !== "SomeRandomPassword") {
      accum[key] = process.env[key];
      return accum;
    }

    process.env[key] = generatePassword(16);
    accum[key] = process.env[key];

    return accum;
  }, {});

  return secrets;
}

export async function ensureReporterCollectsEvidencesConfig() {
  process.env["TEST_REPORTER_STORAGE_ENABLED"] = "true";
  process.env["TEST_REPORTER_STORAGE_PATH"] = path.join(
    __dirname,
    "../workdocs/reports/evidences"
  );
}
