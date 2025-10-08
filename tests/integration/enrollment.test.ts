import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client/services";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { Identity } from "../../src/shared/model/Identity";
import { BaseModel, pk, Repo } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { readFile } from "../../src/index";

jest.setTimeout(5000000);

@model()
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

describe("Test enrollement", async () => {
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
    keyCertOrDirectoryPath:
      "./docker/docker-data/storage/org-a-client-vol/admin/msp/keystore",
    certCertOrDirectoryPath:
      "./docker/docker-data/storage/org-a-client-vol/admin/msp/signcerts",
    tlsCert: await readFile(
      "./docker/docker-data/storage/org-a-client-vol/tls-ca-cert.pem"
    ),
    peerEndpoint: "localhost:7031",
    peerHostAlias: "localhost",
    caEndpoint: "localhost:7054",
    caTlsCertificate:
      "./docker/docker-data/storage/org-a-peer-0-vol/msp/tlscacerts",
    caCert: "./docker/docker-data/storage/org-a-peer-0-vol/msp/signcerts",
    caKey: "./docker/docker-data/storage/org-a-peer-0-vol/msp/keystore",
    chaincodeName: "simple",
    ca: "org-a",
    mspId: "Peer0OrgaMSP",
    channel: "simple-channel",
  };

  let userID: Identity;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let clientAdapter: FabricClientAdapter;
  let enrollmentService: FabricEnrollmentService;
  let TestModelRepository: Repo<TestModel, any, any, any, any>;

  beforeAll(async () => {
    clientAdapter = new FabricClientAdapter(peerConfig);
    TestModelRepository = FabricClientRepository.forModel(TestModel);
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
    const clientUser = new TestModel({
      name: userID.id,
      nif: "123456789",
    });

    const clientUserCreated: TestModel =
      await TestModelRepository.create(clientUser);

    const clientUserRead: TestModel = await TestModelRepository.read(
      clientUserCreated.id
    );
    expect(clientUserRead).toEqual(clientUserCreated);
  });

  it("Creates new Gateway connection with new user", async () => {
    const clientUser = new TestModel({
      name: "user" + userID.id,
      nif: "123456789",
    });

    const clientConfig = {
      keyDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestModelRepository = TestModelRepository.for(clientConfig);

    const clientUserCreated: TestModel =
      await clientTestModelRepository.create(clientUser);

    const clientUserRead: TestModel = await clientTestModelRepository.read(
      clientUserCreated.id
    );
    expect(clientUserRead).toEqual(clientUserCreated);
  });
});
