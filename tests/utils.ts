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

export function packageContract(
  dockerName: string,
  contractFolder: string,
  contractName: string
): void {
  execSync(`docker exec ${dockerName} node ./weaver/lib/core/cli.cjs package-chaincode -d \
    --chaincode-path ./weaver/chaincode/${contractFolder} \
    --lang node \
    --chaincode-output /weaver/peer/${contractName}.tar.gz \
    --chaincode-name ${contractName} \
    --chaincode-version 1.0 -s
    `);
}

export function installContract(dockerName: string, contractName: string) {
  execSync(
    `docker exec ${dockerName} node ./weaver/lib/core/cli.cjs install-chaincode -d -s --chaincode-path ./weaver/peer/${contractName}.tar.gz`
  );
}

export function approveContract(
  dockerName: string,
  contractName: string,
  tlsCertName: string
) {
  execSync(`docker exec ${dockerName} node ./weaver/lib/core/cli.cjs approve-chaincode -d -s \
    --orderer-address org-a-orderer-0:7021 \
    --channel-id simple-channel \
    --chaincode-name ${contractName} \
    --chaincode-version 1.0 \
    --sequence 1 \
    --enable-tls \
    --tls-ca-cert-file /weaver/peer/${tlsCertName}`);
}

export function deployContract(contractFolder: string, contractName: string) {
  const peers = ["org-a-peer-0", "org-b-peer-0", "org-c-peer-0"];

  try {
    for (const peer of peers) {
      packageContract(peer, contractFolder, contractName);
      installContract(peer, contractName);
      approveContract(
        peer,
        contractName,
        peer === "org-a-peer-0" ? "tls-ca-cert.pem" : "orderer-tls-ca-cert.pem"
      );
    }
  } catch (err: any) {
    console.log("Error deploying contract:", err.message);
  }
}

export function commitChaincode(contractName: string) {
  execSync(`docker exec org-a-peer-0 node ./weaver/lib/core/cli.cjs commit-chaincode -d -s \
    --orderer-address org-a-orderer-0:7021 \
    --channel-id simple-channel \
    --chaincode-name ${contractName} \
    --chaincode-version 1.0 \
    --sequence 1 \
    --enable-tls \
    --tls-ca-cert-file /weaver/peer/tls-ca-cert.pem \
    --peer-addresses org-a-peer-0:7031,org-b-peer-0:7032,org-c-peer-0:7033 \
    --peer-root-tls ./weaver/peer/tls-ca-cert.pem,./weaver/peer/org-b-tls-ca-cert.pem,./weaver/peer/org-c-tls-ca-cert.pem`);
}

export async function ensureContractReadiness(
  contractName: string,
  dockerName: string = "org-a-peer-0",
  tlsCert: string = "tls-ca-cert.pem",
  counter = 0
): Promise<string> {
  try {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "healthcheck",
      Args: [],
    });

    if (counter > 10) {
      return "";
    }

    // Invoke the chaincode
    const res = execSync(
      `docker exec ${dockerName} peer chaincode query \
        -C simple-channel \
        -n ${contractName} \
        -c '${chaincodeArgs}' \
        --tls --cafile /weaver/peer/${tlsCert}`
    );

    return res.toString();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err: any) {
    console.log("Chaincode not ready. Retrying...");
    await new Promise((r) => setTimeout(r, 5000)); // Wait for 5 seconds before retrying
    return ensureContractReadiness(
      contractName,
      dockerName,
      tlsCert,
      counter++
    );
  }
}

export function trim(str: string): string {
  console.warn("Contract not trimming response properly: ", str);
  return str.trim();
}

export function invokeChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  transient: any = {},
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  // Prepare the JSON argument for the chaincode
  const chaincodeArgs = JSON.stringify({
    function: functionName,
    Args: args,
  });

  const transientData = JSON.stringify(transient);
  const transientString = `--transient '${transientData}'`;

  // Invoke the chaincode
  return execSync(
    `docker exec ${dockerName} peer chaincode invoke \
    -C simple-channel \
    -n ${contractName} \
    -c '${chaincodeArgs}' \
    --peerAddresses org-a-peer-0:7031 \
    --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
    --peerAddresses org-b-peer-0:7032 \
    --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
    --peerAddresses org-c-peer-0:7033 \
    --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
    -o org-a-orderer-0:7021 \
    --tls --cafile /weaver/peer/${tls} \
    ${transient ? transientString : ""}`
  );
}

export function queryChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  try {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: functionName,
      Args: args,
    });

    // Invoke the chaincode
    const res = execSync(
      `docker exec ${dockerName} peer chaincode query \
        -C simple-channel \
        -n ${contractName} \
        -c '${chaincodeArgs}' \
        --tls --cafile ${tls}`
    );

    const processed = res.toString();
    console.log("Blockchain read:", processed);

    return processed;
  } catch (err: any) {
    console.log("Failed to read blockchain");
    throw err;
  }
}

export function invokePrivateChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  transient: any = {},
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  // Prepare the JSON argument for the chaincode
  const chaincodeArgs = JSON.stringify({
    function: functionName,
    Args: args,
  });

  const transientData = JSON.stringify(transient);
  const transientString = `--transient '${transientData}'`;

  // Invoke the chaincode
  return execSync(
    `docker exec ${dockerName} peer chaincode invoke \
    -C simple-channel \
    -n ${contractName} \
    -c '${chaincodeArgs}' \
    --peerAddresses org-a-peer-0:7031 \
    --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
    -o org-a-orderer-0:7021 \
    --tls --cafile /weaver/peer/${tls} \
    ${transient ? transientString : ""}`
  );

  //   --peerAddresses org-b-peer-0:7032 \
  // --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
  // --peerAddresses org-c-peer-0:7033 \
  // --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
}
