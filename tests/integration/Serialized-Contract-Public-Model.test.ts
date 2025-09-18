import { execSync } from "child_process";
import { ensureInfrastructureBooted } from "../utils";
// import { TestModel } from "../assets/contract/serialized-contract/TestModel";
// import { createCompositeKey, randomName, randomNif } from "../utils";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract With Public Model", () => {
  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();
  });

  it("Should create a new model", async () => {
    console.log("Initializing contract");

    expect(true).toBeTruthy(); // Placeholder for actual contract initialization
  });
});
