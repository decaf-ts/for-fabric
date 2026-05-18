import { execSync } from "child_process";
import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
  nextChaincodeSequence,
} from "../utils";

jest.setTimeout(5000000);
const skipContract = false;

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

    //Compile
    execSync(`npm run build:contract:shared`, { stdio: "inherit" });

    //RM extra file from meta-inf
    execSync(
      `rm -f ./docker/infrastructure/chaincode/GlobalContract/META-INF/collections_config.json`,
      { stdio: "inherit" }
    );

    // Deploy contract
    deployContract(
      contractFolderName,
      contractName,
      contract_sequence,
      version,
      ["org-a-peer-0", "org-b-peer-0", "org-c-peer-0"],
      true
    );

    // Commit Chaincode
    commitChaincode(contractName, contract_sequence, version, true);
  });

  it("logs", async () => {
    console.log("test");
  });
});
