import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { TestModel } from "../assets/contract/serialized-contract/TestModel";

jest.setTimeout(5000000);

describe("Test Contracts", () => {
  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    await new Promise((r) => setTimeout(r, 60000)); // Wait for readiness
  });

  const ensureFolderExists = (dirPath) => {
    const basePath = process.cwd();

    const resolvedPath = path.join(basePath, dirPath);

    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
      console.log(`Folder created: ${resolvedPath}`);
      return false;
    } else {
      console.log(`Folder already exists: ${resolvedPath}`);
      return true;
    }
  };

  describe("Test Serialized Contract", () => {
    beforeAll(async () => {
      // Check if contract was present
      const boot = ensureFolderExists(
        "./docker/infrastructure/chaincode/serialized"
      );

      if (boot) {
        // Compile/Transpile the contract to JavaScript
        execSync(
          `npx weaver compile-contract -d --contract-file ./tests/assets/contract/serialized-contract/index.ts --output-dir ./docker/infrastructure/chaincode/serialized`
        );

        // Copy necessary files to the chaincode directory
        fs.copyFileSync(
          path.join(
            process.cwd(),
            "./tests/assets/contract/serialized-contract/package.json"
          ),
          path.join(
            process.cwd(),
            "./docker/infrastructure/chaincode/serialized/package.json"
          )
        );

        fs.copyFileSync(
          path.join(
            process.cwd(),
            "./tests/assets/contract/serialized-contract/npm-shrinkwrap.json"
          ),
          path.join(
            process.cwd(),
            "./docker/infrastructure/chaincode/serialized/npm-shrinkwrap.json"
          )
        );
      }
    });
  });
});

describe.skip("Test Basic Contract", () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 30000)); // Wait for readiness
    // Compile/Transpile the contract to JavaScript
    execSync(
      `npx weaver compile-contract -d --contract-file ./tests/assets/contract/basic-fabric-contract/index.ts --output-dir ./docker/infrastructure/chaincode`
    );

    // Copy necessary files to the chaincode directory
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/basic-fabric-contract/package.json"
      ),
      path.join(process.cwd(), "./docker/infrastructure/chaincode/package.json")
    );
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/basic-fabric-contract/npm-shrinkwrap.json"
      ),
      path.join(
        process.cwd(),
        "./docker/infrastructure/chaincode/npm-shrinkwrap.json"
      )
    );
  });

  it("Should create data", async () => {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "createData",
      Args: ["test1", JSON.stringify({ name: "Alice", nif: "12345" })],
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

    await new Promise((r) => setTimeout(r, 10000)); // Wait for commit

    // Query the chaincode
    const queryArgs = JSON.stringify({
      function: "readData",
      Args: ["test1"],
    });

    const res = execSync(
      `docker exec org-a-peer-0 peer chaincode query \
      -C simple-channel \
      -n simple \
      -c '${queryArgs}' \
      --tls --cafile /weaver/peer/tls-ca-cert.pem`
    );

    console.log(res.toString());
  });
});

describe.skip("Test Serialized Crud Contract", () => {
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

  it("Should create data", async () => {
    let ready = false;

    const healcheckChaincodeArgs = JSON.stringify({
      function: "healthcheck",
      Args: [],
    });

    while (!ready) {
      const res = execSync(
        `docker exec org-a-peer-0 peer chaincode query \
          -C simple-channel \
          -n simple \
          -c '${healcheckChaincodeArgs}' \
          --tls --cafile /weaver/peer/tls-ca-cert.pem`
      );

      ready = res.toString().includes("ready");

      console.log(`Chaincode is ${ready ? "ready" : "not ready"}`);
    }

    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "createData",
      Args: ["test1", JSON.stringify({ name: "Alice", nif: "12345" })],
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

    await new Promise((r) => setTimeout(r, 10000)); // Wait for commit
    console.log(chaincodeArgs);

    // Query the chaincode
    const queryArgs = JSON.stringify({
      function: "readData",
      Args: ["test1"],
    });

    const res = execSync(
      `docker exec org-a-peer-0 peer chaincode query \
      -C simple-channel \
      -n simple \
      -c '${queryArgs}' \
      --tls --cafile /weaver/peer/tls-ca-cert.pem`
    );

    console.log(res.toString());

    const model = new TestModel({ name: "Alice", nif: "12345" }).serialize();

    console.log(model);

    // Prepare the JSON argument for the chaincode
    const chaincodeArgs1 = JSON.stringify({
      function: "create",
      Args: [model],
    });

    // Invoke the chaincode
    execSync(
      `docker exec org-a-peer-0 peer chaincode invoke \
      -C simple-channel \
      -n simple \
      -c '${chaincodeArgs1}' \
      --peerAddresses org-a-peer-0:7031 \
      --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
      --peerAddresses org-b-peer-0:7032 \
      --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
      --peerAddresses org-c-peer-0:7033 \
      --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
      -o org-a-orderer-0:7021 \
      --tls --cafile /weaver/peer/tls-ca-cert.pem`
    );

    // // Query the chaincode
    // const queryArgs = JSON.stringify({
    //   function: "readData",
    //   Args: ["test1"],
    // });

    // const res = execSync(
    //   `docker exec org-a-peer-0 peer chaincode query \
    //   -C simple-channel \
    //   -n simple \
    //   -c '${queryArgs}' \
    //   --tls --cafile /weaver/peer/tls-ca-cert.pem`
    // );

    // console.log(res.toString());
  });
});
