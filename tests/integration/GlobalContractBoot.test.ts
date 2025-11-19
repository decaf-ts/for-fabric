import { execSync } from "child_process";
import {
  ensureContractReadiness,
  ensureInfrastructureBooted,
  invokeChaincode,
  trim,
} from "../utils";
import { ChaincodeManager } from "../ChaincodeManager";
import * as path from "path";

const ROOT_PATH = "/home/pccosta/pdm/epi/PLA-Workspace/toolkit";
const SOURCE_CONTRACT_FOLDER = "ProductContract";
const CONTRACT_NAME = "ProductContract";
const SEQUENCE: number | undefined = undefined;
const dockerBindVolume = path.join(
  process.cwd(),
  "docker",
  "infrastructure",
  "chaincode"
);

jest.setTimeout(5000000);

describe("Global Contract Boot", () => {
  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    const chaincodeManager = new ChaincodeManager({
      rootPath: ROOT_PATH,
      contractFolder: SOURCE_CONTRACT_FOLDER,
      contractName: CONTRACT_NAME,
      sequence: SEQUENCE,
    });
    chaincodeManager.compile(dockerBindVolume).deploy().commit();
  });

  it("Deploys contract corretly", async () => {
    const ready = await ensureContractReadiness(CONTRACT_NAME);
    expect(ready).toBeDefined();
  });

  it("Should initialize contract", async () => {
    const ready = await ensureContractReadiness(CONTRACT_NAME);

    if (trim(ready) === "false") {
      try {
        console.log("Initializing contract...");
        invokeChaincode(CONTRACT_NAME, "init", []);
      } catch (error: any) {
        console.error("Error initializing contract:", error);
        expect(error).toBeUndefined();
      }
    }

    const readyCheck = await ensureContractReadiness(CONTRACT_NAME);
    expect(trim(readyCheck)).toBe("true");
  });

  // it("Whoami", async () => {
  //   try {
  //     console.log("Initializing contract...");
  //     let res = queryChaincode(contractName, "whoami", []);
  //     console.log("Whoami result: ", res);
  //     res = JSON.parse(res);
  //     expect((res as any).whoami).toBe(contractName);
  //   } catch (error: any) {
  //     console.error("Error initializing contract:", error);
  //     expect(error).toBeUndefined();
  //   }
  // });
});
