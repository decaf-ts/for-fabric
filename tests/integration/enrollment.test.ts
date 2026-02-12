import { execSync } from "child_process";
import * as fs from "fs";
import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client/services";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { Identity } from "../../src/shared/model/Identity";
import { Repo } from "@decaf-ts/core";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { TestPublicModelContract } from "../assets/contract/serialized-contract-public-model/TestPublicModelContract";
import {
  commitChaincode,
  compileContract,
  deployContract,
  ensureInfrastructureBooted,
  nextChaincodeSequence,
  randomName,
} from "../utils";
import { TestPublicModel } from "../assets/contract/serialized-contract-public-model/TestPublicModel";

jest.setTimeout(5000000);

describe("Test enrollement", () => {
  const contractFolderName = "serialized-contract-public-model";
  const contractName = TestPublicModelContract.name;
  const chaincodeName = `${contractName}-${Date.now()}`;
  const adapterAlias = "hlf-fabric-test-enrollment";

  const user: Credentials = {
    userName: "TestUser" + Date.now(),
    password: "TestUserPSW",
  };

  const caConfig: CAConfig = {
    url: "https://localhost:7011",
    tls: {
      trustedRoots: ["./docker/docker-data/tls-ca-cert.pem"],
      verify: true,
    },
    caName: "org-a",
    caCert: "./docker/docker-data/admin/msp/signcerts",
    caKey: "./docker/docker-data/admin/msp/keystore",
  };

  let peerConfig: PeerConfig;

  let userID: Identity;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let clientAdapter: FabricClientAdapter;
  let enrollmentService: FabricEnrollmentService;
  let TestModelRepository: Repo<TestPublicModel>;

  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`, { stdio: "inherit" });

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Check if contract folder exists and compile it if not
    // Compile contract
    compileContract(contractFolderName);

    const sequence = nextChaincodeSequence(chaincodeName);
    const version = `${Date.now()}`;

    //Deploy contract
    deployContract(contractFolderName, chaincodeName, sequence, version);

    // Commit Chaincode
    commitChaincode(chaincodeName, sequence, version);

    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`, {
      stdio: "inherit",
    });

    peerConfig = {
      cryptoPath: "./docker/infrastructure/crypto-config",
      keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
      certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
      tlsCert: fs.readFileSync("./docker/docker-data/tls-ca-cert.pem"),
      peerEndpoint: "localhost:7031",
      peerHostAlias: "localhost",
      chaincodeName: chaincodeName,
      ca: "org-a",
      mspId: "Peer0OrgaMSP",
      channel: "simple-channel",
    };

    clientAdapter = new FabricClientAdapter(peerConfig, adapterAlias);
    TestModelRepository = FabricClientRepository.forModel(
      TestPublicModel,
      adapterAlias
    );
  });

  it("register and enroll new user ", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);
    userID = await enrollmentService.registerAndEnroll(
      user,
      false,
      "",
      "client"
    );
    expect(userID.id).toBeDefined();
  });

  it("Creates new Gateway connection ", async () => {
    const clientUser = new TestPublicModel({
      name: randomName(6),
      nif: "123456799",
    });

    const clientUserCreated: TestPublicModel =
      await TestModelRepository.create(clientUser);

    const clientUserRead: TestPublicModel = await TestModelRepository.read(
      clientUserCreated.id
    );
    expect(clientUserRead).toEqual(clientUserCreated);
  });

  it("Creates new Gateway connection with new user", async () => {
    const clientUser = new TestPublicModel({
      name: "user" + userID.id,
      nif: "123456789",
    });

    const clientConfig = {
      keyDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestModelRepository = TestModelRepository.for(clientConfig);

    const clientUserCreated: TestPublicModel =
      await clientTestModelRepository.create(clientUser);

    const clientUserRead: TestPublicModel =
      await clientTestModelRepository.read(clientUserCreated.id);
    expect(clientUserRead).toEqual(clientUserCreated);
  });
});
