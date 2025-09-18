import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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

export function didInfrastructureBoot(
  containerName: string = "boot-org-c-peer-0"
): boolean {
  try {
    const output = execSync(
      `docker inspect ${containerName} --format='{{.State.ExitCode}}'`
    )
      .toString()
      .trim();

    return output === "0";
  } catch (err: any) {
    console.error("Error inspecting container:", err.message);
    return false;
  }
}

export async function ensureInfrastructureBooted(
  containerName: string = "boot-org-c-peer-0"
): Promise<void> {
  while (!didInfrastructureBoot(containerName)) {
    console.log("Waiting for infrastructure to boot...");
    await new Promise((r) => setTimeout(r, 5000)); // Wait for 5 seconds before retrying
  }
}

export function compileContract(contractFolder: string): void {
  // create folder
  fs.mkdirSync(
    path.join(__dirname, "../docker/infrastructure/chaincode", contractFolder),
    { recursive: true }
  );

  // Compile/Transpile the contract to JavaScript
  execSync(
    `npx weaver compile-contract -d --contract-file ${path.join(__dirname, "./assets/contract", contractFolder, "index.ts")} --output-dir ${path.join(__dirname, "../docker/infrastructure/chaincode/", contractFolder)}`
  );

  // Copy necessary files to the chaincode directory
  fs.copyFileSync(
    path.join(__dirname, `./assets/contract/${contractFolder}/package.json`),
    path.join(
      __dirname,
      `../docker/infrastructure/chaincode/${contractFolder}/package.json`
    )
  );
  fs.copyFileSync(
    path.join(
      __dirname,
      `./assets/contract/${contractFolder}/npm-shrinkwrap.json`
    ),
    path.join(
      __dirname,
      `../docker/infrastructure/chaincode/${contractFolder}/npm-shrinkwrap.json`
    )
  );
}
