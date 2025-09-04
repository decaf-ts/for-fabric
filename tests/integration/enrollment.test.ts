import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client/services";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { Identity } from "../../src/shared/model/Identity";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { BaseModel, pk } from "@decaf-ts/core";
import { Property } from "fabric-contract-api";
import {
  maxlength,
  minlength,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";

jest.setTimeout(5000000);

class TestModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name!: string;

  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}

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

  const peerConfig: PeerConfig = {
    cryptoPath: "./docker/infrastructure/crypto-config",
    keyDirectoryPath:
      "./docker/docker-data/storage/org-a-peer-0-vol/msp/keystore",
    certDirectoryPath:
      "./docker/docker-data/storage/org-a-peer-0-vol/msp/signcerts",
    tlsCertPath: "./docker/docker-data/storage/org-a-peer-0-vol/msp/cacerts",
    peerEndpoint: "org-a-peer-0:7031",
    peerHostAlias: "localhost",
    caEndpoint: "localhost:7054",
    caTlsCertificate:
      "./docker/docker-data/storage/org-a-peer-0-vol/msp/tlscacerts",
    caCert: "./docker/docker-data/storage/org-a-peer-0-vol/msp/signcerts",
    caKey: "./docker/docker-data/storage/org-a-peer-0-vol/msp/keystore",
    chaincodeName: "simple",
    ca: "org-a",
    mspId: "org-a",
    channel: "simple-channel",
  };

  let userID: Identity;
  let clientAdapter: FabricClientAdapter;
  let enrollmentService: FabricEnrollmentService;

  beforeAll(async () => {});

  it("register and enroll new user ", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);
    userID = await enrollmentService.registerAndEnroll(user, false, "", "user");
    console.log("User registered and enrolled successfully", userID);
    expect(userID.id).toBeDefined();
  });

  it("Creates new Gateway connection ", async () => {
    clientAdapter = new FabricClientAdapter(peerConfig, "ola");

    const clientUser = new TestModel({
      name: userID.id,
      nif: "123456789",
    });

    const TestModelRepository = FabricClientRepository.forModel(
      TestModel,
      "ola"
    );

    const clientUserCreated: TestModel =
      await TestModelRepository.create(clientUser);

    const clientUserRead: TestModel = await TestModelRepository.read(
      clientUserCreated.id
    );
    expect(clientUserRead).toEqual(clientUser);
  });
});
