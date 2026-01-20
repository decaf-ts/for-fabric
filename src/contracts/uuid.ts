const encoder = new TextEncoder();

export function bytesToUuidV5Style(bytes16: Uint8Array): string {
  const b = bytes16.slice(0, 16);

  // Set version to 5 (0101xxxx) to signal deterministic hashing
  b[6] = (b[6] & 0x0f) | 0x50;

  // Set variant to RFC 4122 (10xxxxxx)
  b[8] = (b[8] & 0x3f) | 0x80;

  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export async function uuidFromSeed(seed: string): Promise<string> {
  // Browser / any runtime with WebCrypto
  if (globalThis.crypto?.subtle) {
    const data = encoder.encode(seed);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return bytesToUuidV5Style(new Uint8Array(digest).slice(0, 16));
  }

  // Node fallback: dynamic import avoids bundling node:crypto into browser
  const nodeCrypto = await import("crypto");
  const { createHash, webcrypto } = nodeCrypto;

  if (webcrypto?.subtle) {
    const data = encoder.encode(seed);
    const digest = await webcrypto.subtle.digest("SHA-256", data);
    return bytesToUuidV5Style(new Uint8Array(digest).slice(0, 16));
  }

  const hex = createHash("sha256").update(seed).digest("hex");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytesToUuidV5Style(bytes);
}
