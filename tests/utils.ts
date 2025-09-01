export function createCompositeKey(objectType, attributes = []) {
  const DELIMITER = "\u0000"; // Fabric reserved delimiter
  if (!objectType) {
    throw new Error("objectType is required");
  }
  if (!Array.isArray(attributes)) {
    throw new Error("attributes must be an array of strings");
  }

  // Start with the objectType and delimiter
  let key = objectType + DELIMITER;

  // Append each attribute followed by delimiter
  for (const attr of attributes) {
    if (typeof attr !== "string") {
      throw new Error("All attributes must be strings");
    }
    key += attr + DELIMITER;
  }

  return key;
}

export function random(sample, n) {
  let result = "";
  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * sample.length);
    result += sample[randomIndex];
  }
  return result;
}
export function randomName(n) {
  const sample =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  return random(sample, n);
}
export function randomNif(n) {
  const sample = "1234567890";
  return random(sample, n);
}
