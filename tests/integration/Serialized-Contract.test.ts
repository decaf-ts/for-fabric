import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { TestModel } from "../assets/contract/serialized-contract/TestModel";
import { randomName, randomNif } from "../utils";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract", () => {
  // This ensures the infrastructure is up and running before running the tests.
  beforeAll(async () => {
    // Compile/Transpile the contract to JavaScript
    execSync(
      `npx weaver compile-contract -d --contract-file ./tests/assets/contract/serialized-contract/index.ts --output-dir ./docker/infrastructure/chaincode`
    );

    // Copy necessary files to the chaincode directory
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/serialized-contract/package.json"
      ),
      path.join(process.cwd(), "./docker/infrastructure/chaincode/package.json")
    );
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/serialized-contract/npm-shrinkwrap.json"
      ),
      path.join(
        process.cwd(),
        "./docker/infrastructure/chaincode/npm-shrinkwrap.json"
      )
    );

    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);
  });

  const ensureReadiness = async () => {
    try {
      // Prepare the JSON argument for the chaincode
      const chaincodeArgs = JSON.stringify({
        function: "healthcheck",
        Args: [],
      });

      // Invoke the chaincode
      const res = execSync(
        `docker exec org-a-peer-0 peer chaincode query \
          -C simple-channel \
          -n simple \
          -c '${chaincodeArgs}' \
          --tls --cafile /weaver/peer/tls-ca-cert.pem`
      );

      return res.toString();
    } catch (e: unknown) {
      console.log("Chaincode not ready. Retrying...");
      await new Promise((r) => setTimeout(r, 5000)); // Wait for 5 seconds before retrying
      return ensureReadiness();
    }
  };

  const trim = (str: string) => {
    console.warn("Contract not trimming response properly: ", str);
    return str.trim();
  };

  const invokeChaincode = async (functionName: string, args: any[]) => {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: functionName,
      Args: args,
    });

    // Invoke the chaincode
    execSync(
      `docker exec org-a-peer-0 peer chaincode invoke \
      -C simple-channel \
      -n simple \
      -c '${chaincodeArgs}' \
      --peerAddresses org-a-peer-0:7031 \
      --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
      --peerAddresses org-b-peer-0:7032 \
      --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
      --peerAddresses org-c-peer-0:7033 \
      --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
      -o org-a-orderer-0:7021 \
      --tls --cafile /weaver/peer/tls-ca-cert.pem`
    );
  };

  it("Boosts infrastructure", async () => {
    console.log("Booting infrastructure...");
    const ready = await ensureReadiness();
    console.log("Infrastructure booted successfully");

    expect(ready).toBeDefined();
  });

  it("Healthcheck Shoudl return false", async () => {
    const ready = await ensureReadiness();

    // FOR SOME REASON THE TRIM INSIDE THE CONTRACT IS NOT WORKING
    expect(trim(ready)).toBe("false");
  });

  it("Should Initialize contract", async () => {
    // ensure contract is running
    const ready = await ensureReadiness();
    expect(trim(ready)).toBe("false");

    try {
      await invokeChaincode("init", []);
    } catch (error) {
      console.error("Error initializing contract:", error);
      expect(error).toBeUndefined();
    }
  });

  it("HealthCheck should return true", async () => {
    const ready = await ensureReadiness();
    expect(trim(ready)).toBe("true");
  });

  it("Should create model", async () => {
    const ready = await ensureReadiness();

    expect(trim(ready)).toBe("true");

    const data = { name: randomName(6), nif: randomNif(9) };
    const model = new TestModel(data);

    console.log("Using model: ", model.serialize());

    try {
      await invokeChaincode("create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });
});
