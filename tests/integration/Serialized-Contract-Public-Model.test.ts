import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  compileContract,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils";
// import { TestModel } from "../assets/contract/serialized-contract/TestModel";
// import { createCompositeKey, randomName, randomNif } from "../utils";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract With Public Model", () => {
  const contractFolderName = "serialized-contract-public-model";
  const contractName = "TestPublicModel";

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

    // Compile contract
    compileContract(contractFolderName);

    //Deploy contract
    deployContract(contractFolderName, contractName);
  });

  it("Should create a new model", async () => {
    console.log("Initializing contract");

    expect(true).toBeTruthy(); // Placeholder for actual contract initialization
  });
});
