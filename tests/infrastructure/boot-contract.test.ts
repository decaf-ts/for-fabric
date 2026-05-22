import { execSync } from "child_process";
import { writeFile } from "fs/promises";
import * as fs from "fs";

import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
  nextChaincodeSequence,
} from "../utils";

import path from "path";

jest.setTimeout(5000000);
const skipContract = false;

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  await writeFile(filePath, json, "utf8");
}

function readJsonFile(filePath: string) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error: any) {
    console.error("Error reading JSON file:", error.message);
    return null;
  }
}

function filterCollections<T extends { name: string }>(items: T[]): T[] {
  return items.filter(
    (item) => !item.name.startsWith("_") && !item.name.startsWith("-")
  );
}

describe("Boot Contracts", () => {
  beforeAll(async () => {
    if (skipContract) return;
    const contractFolderName = "GlobalContract";
    const contractName = "global";
    const contract_sequence = nextChaincodeSequence(contractName);
    const version = `${contract_sequence}.0`;

    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`, { stdio: "inherit" });
    await ensureInfrastructureBooted();

    execSync(`rm -rf ./docker/infrastructure/chaincode/GlobalContract`, {
      stdio: "inherit",
    });

    //Compile
    execSync(`npm run build:contract:shared`, { stdio: "inherit" });

    //RM extra file from meta-inf
    execSync(
      `rm -f ./docker/infrastructure/chaincode/GlobalContract/META-INF/collections_config.json`,
      { stdio: "inherit" }
    );

    const c = readJsonFile(
      "./docker/infrastructure/chaincode/GlobalContract/collections_config.json"
    );

    const collection = filterCollections(c);

    execSync(
      `rm -f ./docker/infrastructure/chaincode/GlobalContract/collections_config.json`,
      { stdio: "inherit" }
    );

    // const collections: { [indexer: string]: any }[] = [
    //   {
    //     name: "decaf-namespace-mirror",
    //     policy: "OR('OrgaMSP.member')",
    //     requiredPeerCount: 0,
    //     maxPeerCount: 0,
    //     blockToLive: 0,
    //     memberOnlyRead: true,
    //     memberOnlyWrite: false,
    //     endorsementPolicy: {
    //       signaturePolicy: "OR('OrgaMSP.peer')",
    //     },
    //   },
    //   {
    //     name: "decaf-namespaceOrg-B",
    //     policy: "OR('OrgbMSP.member','OrgaMSP.member')",
    //     requiredPeerCount: 1,
    //     maxPeerCount: 2,
    //     blockToLive: 0,
    //     memberOnlyRead: true,
    //     memberOnlyWrite: true,
    //     endorsementPolicy: {
    //       signaturePolicy: "AND('OrgbMSP.peer','OrgaMSP.peer')",
    //     },
    //   },
    //   {
    //     name: "decaf-namespaceOrg-C",
    //     policy: "OR('OrgbMSP.member','OrgaMSP.member')",
    //     requiredPeerCount: 1,
    //     maxPeerCount: 2,
    //     blockToLive: 0,
    //     memberOnlyRead: true,
    //     memberOnlyWrite: true,
    //     endorsementPolicy: {
    //       signaturePolicy: "AND('OrgbMSP.peer','OrgaMSP.peer')",
    //     },
    //   },
    // ];

    const p = path.join(
      __dirname,
      "../../docker/infrastructure/chaincode/GlobalContract/collections_config.json"
    );

    // console.log(p);

    await writeJsonFile(p, collection);

    // Deploy contract
    deployContract(
      contractFolderName,
      contractName,
      contract_sequence,
      version,
      ["org-a-peer-0", "org-b-peer-0", "org-c-peer-0"],
      true
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log("Commiting");

    // Commit Chaincode
    commitChaincode(contractName, contract_sequence, version, true);
  });

  it("logs", async () => {
    console.log("test");
  });
});
