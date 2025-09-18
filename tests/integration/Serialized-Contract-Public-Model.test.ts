import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  commitChaincode,
  compileContract,
  createCompositeKey,
  deployContract,
  ensureContractReadiness,
  ensureInfrastructureBooted,
  invokeChaincode,
  queryChaincode,
  randomName,
  randomNif,
  trim,
} from "../utils";
import { TestModel } from "../assets/contract/serialized-contract-public-model/TestModel";
// import { createCompositeKey, randomName, randomNif } from "../utils";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract With Public Model", () => {
  const contractFolderName = "serialized-contract-public-model";
  const contractName = "TestPublicModel";
  const sequenceTableName = "??sequence";
  const modelTableName = "tst_user";
  const sequenceId = "TestModel_pk";

  const getData = () => {
    return {
      name: randomName(6),
      nif: randomNif(9),
    };
  };

  const getCurrentId = (collection: string = "none") => {
    let sequence;

    const args = [
      createCompositeKey(sequenceTableName, [sequenceId]),
      collection,
    ].filter((el) => el !== undefined);

    try {
      sequence = queryChaincode(contractName, "readByPass", args);
    } catch (error) {
      expect(error).toBeUndefined();
    }
    console.log("Model created successfully: ", sequence);

    expect(sequence).toBeDefined();
    sequence = JSON.parse(sequence!);
    expect(sequence.id).toBe(sequenceId);
    expect(sequence.current).toBeGreaterThan(0);

    return sequence.current;
  };

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

    // Commit Chaincode
    commitChaincode(contractName);
  });

  it("Deploys contract corretly", async () => {
    const ready = await ensureContractReadiness(contractName);
    expect(ready).toBeDefined();
  });

  it("Should initialize contract", async () => {
    const ready = await ensureContractReadiness(contractName);

    if (trim(ready) === "false") {
      try {
        console.log("Initializing contract...");
        invokeChaincode(contractName, "init", []);
      } catch (error: any) {
        console.error("Error initializing contract:", error);
        expect(error).toBeUndefined();
      }
    }

    const readyCheck = await ensureContractReadiness(contractName);
    expect(trim(readyCheck)).toBe("true");
  });

  it("Should create model", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

    const id = getCurrentId();

    expect(id).toBeDefined();

    // try {
    //   const record = queryChaincode(contractName, "readByPass", id);

    //   expect(record["tst_name"]).toBe(model.name);
    //   expect(record["tst_nif"]).toBe(model.nif);

    //   const privateRecord = await readByPass(id, true);

    //   expect(privateRecord["tst_email"]).toBe(transientData.transient!.email);
    // } catch (e: unknown) {
    //   expect(e).toBeUndefined();
    // }
  });
});
