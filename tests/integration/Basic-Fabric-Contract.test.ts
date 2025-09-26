import {
  commitChaincode,
  compileContract,
  deployContract,
  ensureInfrastructureBooted,
  invokeChaincode,
} from "../utils";
import * as fs from "fs";
import { execSync } from "child_process";
import * as path from "path";

describe("Test Serialized Crud Contract With Public Model", () => {
  const contractFolderName = "basic-contract";
  const contractName = "AssetTransferContract";
  const contract_sequence = 1;

  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Check if contract folder exists and compile it if not
    if (
      fs.existsSync(
        path.join(
          __dirname,
          "../../docker/infrastructure/chaincode",
          contractFolderName
        )
      )
    ) {
      console.log("Contract folder already exists");
      return;
    }

    console.log("Compiling contract: ", contractName);

    // Compile contract
    compileContract(contractFolderName);

    //Deploy contract
    deployContract(contractFolderName, contractName, contract_sequence);

    // Commit Chaincode
    commitChaincode(contractName, contract_sequence);
  });

  it("Deploys contract correctly", async () => {
    console.log("Contract deployed successfully");
  });

  it("Should initialize contract", async () => {
    try {
      console.log("Initializing contract...");
      invokeChaincode(contractName, "InitLedger", []);
    } catch (error: any) {
      console.error("Error initializing contract:", error);
      expect(error).toBeUndefined();
    }
  });

  it("Should create asset", async () => {
    try {
      console.log("Initializing contract...");
      invokeChaincode(contractName, "CreateAsset", [
        "testrecord",
        "red",
        "10",
        "Alice",
        "1000",
      ]);
    } catch (error: any) {
      console.error("Error initializing contract:", error);
      expect(error).toBeUndefined();
    }
  });
});
