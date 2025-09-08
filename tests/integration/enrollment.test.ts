import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client/services";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { Identity } from "../../src/shared/model/Identity";
import { BaseModel, pk } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";

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

describe("Test enrollement", () => {
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
      "./docker/docker-data/storage/org-a-client-vol/admin/msp/keystore",
    certDirectoryPath:
      "./docker/docker-data/storage/org-a-client-vol/admin/msp/signcerts",
    tlsCertPath:
      "./docker/docker-data/storage/org-a-client-vol/tls-ca-cert.pem",
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
    // peerConfig.keyDirectoryPath = userID.credentials!.privateKey!;
    // peerConfig.certDirectoryPath = userID.credentials!.certificate!;
    // peerConfig.tlsCertPath = userID.credentials!.rootCertificate!;
    clientAdapter = new FabricClientAdapter(peerConfig);

    const clientUser = new TestModel({
      name: userID.id,
      nif: "123456789",
    });

    const TestModelRepository = FabricClientRepository.forModel(TestModel);

    const clientUserCreated: TestModel =
      await TestModelRepository.create(clientUser);

    const clientUserRead: TestModel = await TestModelRepository.read(
      clientUserCreated.id
    );
    expect(clientUserRead).toEqual(clientUserCreated);
  });
});
