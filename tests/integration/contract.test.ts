import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { TestModel } from "../assets/contract/serialized-contract/TestModel";

jest.setTimeout(5000000);

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

    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);
  });

  it.skip("Should create data", async () => {
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

describe("Test Serialized Crud Contract", () => {
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

  it("boots infrastructure", async () => {
    console.log("Booting infrastructure...");
    const ready = await ensureReadiness();
    console.log("Is Ready: ", ready);
  });

  it("Should createData", async () => {
    const ready = await ensureReadiness();

    const id = "test1";
    const data = { name: "Alice", nif: "123456789" };

    console.log("Is Ready: ", ready);

    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "createData",
      Args: [id, JSON.stringify(data)],
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
      Args: [id],
    });

    const res = execSync(
      `docker exec org-a-peer-0 peer chaincode query \
      -C simple-channel \
      -n simple \
      -c '${queryArgs}' \
      --tls --cafile /weaver/peer/tls-ca-cert.pem`
    );

    const model = JSON.parse(res.toString());

    console.log(res.toString());

    expect(model).toBeDefined();
    expect(model.name).toBe(data.name);
    expect(model.nif).toBe(data.nif);
  });

  it("Should create", async () => {
    const ready = await ensureReadiness();

    const data = { name: "Alice1", nif: "123456789" };

    console.log("Is Ready: ", ready);
    const model = new TestModel(data);

    console.log(model.serialize());

    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "create",
      Args: [model.serialize()],
    });

    // Invoke the chaincode
    const test = execSync(
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

    console.log(test.toString());
    // console.log(chaincodeArgs);
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
    // Prepare the JSON argument for the chaincode
    // const chaincodeArgs1 = JSON.stringify({
    //   function: "create",
    //   Args: [JSON.stringify(model)],
    // });
    // // Invoke the chaincode
    // execSync(
    //   `docker exec org-a-peer-0 peer chaincode invoke \
    //   -C simple-channel \
    //   -n simple \
    //   -c '${chaincodeArgs1}' \
    //   --peerAddresses org-a-peer-0:7031 \
    //   --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
    //   --peerAddresses org-b-peer-0:7032 \
    //   --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
    //   --peerAddresses org-c-peer-0:7033 \
    //   --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
    //   -o org-a-orderer-0:7021 \
    //   --tls --cafile /weaver/peer/tls-ca-cert.pem`
    // );
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
