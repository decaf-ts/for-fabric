import { Credentials, CAConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/shared/services";
import { Identity } from "../../src/shared/model/Identity";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

jest.setTimeout(5000000);

describe("Test enrollement", () => {
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
  const user: Credentials = {
    userName: "TestUser" + Date.now(),
    password: "TestUserPSW",
  };

  const caConfig: CAConfig = {
    url: "https://localhost:7011",
    tls: {
      trustedRoots: [
        "./docker/docker-data/storage/org-a-client-vol/tls-ca-cert.pem",
      ],
      verify: true,
    },
    caName: "org-a",
    caCert: "./docker/docker-data/storage/org-a-client-vol/admin/msp/signcerts",
    caKey: "./docker/docker-data/storage/org-a-client-vol/admin/msp/keystore",
  };

  beforeAll(async () => {});

  it("register and enroll ", async () => {
    let enrollmentService: FabricEnrollmentService;
    let userID: Identity;
    try {
      enrollmentService = new FabricEnrollmentService(caConfig);
      userID = await enrollmentService.registerAndEnroll(
        user,
        false,
        "",
        "user"
      );
      console.log("User registered and enrolled successfully", userID);
      expect(userID.id).toBeDefined();
    } catch (e: any) {
      console.log(e);
    }
  });
});
