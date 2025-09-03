export function createCompositeKey(
  objectType: string,
  attributes: string[]
): string {
  const COMPOSITEKEY_NS = "\x00";
  const MIN_UNICODE_RUNE_VALUE = "\u0000";

  validateCompositeKeyAttribute(objectType);
  if (!Array.isArray(attributes)) {
    throw new Error("attributes must be an array");
  }

  let compositeKey = COMPOSITEKEY_NS + objectType + MIN_UNICODE_RUNE_VALUE;
  attributes.forEach((attribute) => {
    validateCompositeKeyAttribute(attribute);
    compositeKey = compositeKey + attribute + MIN_UNICODE_RUNE_VALUE;
  });
  return compositeKey;
}
export function validateCompositeKeyAttribute(attr: any) {
  if (!attr || typeof attr !== "string" || attr.length === 0) {
    throw new Error("object type or attribute not a non-zero length string");
  }
}

export function random(sample: string[], n: number): string {
  let result = "";
  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * sample.length);
    result += sample[randomIndex];
  }
  return result;
}
export function randomName(n: number): string {
  const sample =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  return random(sample, n);
}
export function randomNif(n: number): string {
  const sample = "1234567890";
  return random(sample, n);
}
