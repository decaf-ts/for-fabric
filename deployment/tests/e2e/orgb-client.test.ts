import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  CAConfig,
  FabricClientAdapter,
  FabricEnrollmentService,
  PeerConfig,
} from "../../../src";
import { Repository } from "@decaf-ts/core";
import { OtherProduct } from "../../../src/contract/trackedModels/OtherProduct";

jest.setTimeout(3000000);

/**
 * Proves the client SDK works against the deployed multi-org infrastructure,
 * using orgb as the client organization:
 * - copies orgb crypto material from the orgb-ca container (same mechanism as
 *   the `copy:crypto` script, but for orgb);
 * - configures the CA (https://localhost:7210, ca name orgb-ca) and peer
 *   (localhost:7250) connections;
 * - registers and enrolls a user account on orgb's CA;
 * - creates a single OtherProduct through the client repository.
 */
describe("Client operations against deployed infrastructure (orgb)", () => {
  const contractName = "simple-chaincode";
  let caConfig: CAConfig;
  let peerConfig: PeerConfig;
  let repository: Repository<OtherProduct, any>;

  beforeAll(() => {
    // Copy orgb crypto material (orgb.admin CA enrollment + orgb TLS CA chain)
    execSync("mkdir -p docker/docker-data", { stdio: "inherit" });
    execSync("docker cp orgb-ca:/etc/hyperledger/client ./docker/docker-data", {
      stdio: "inherit",
    });

    // orgb's TLS CA is an intermediate signed by an external PKI root, so the
    // full chain (orgb-tls intermediate + ext root) is required to validate
    // both the orgb CA server TLS certificate and the orgb peer TLS certificate
    const tlsMspDir = "./docker/docker-data/client/admin/tls/msp";
    const chain = ["tlsintermediatecerts", "tlscacerts"]
      .flatMap((dir) =>
        fs
          .readdirSync(path.join(tlsMspDir, dir))
          .map((f) => fs.readFileSync(path.join(tlsMspDir, dir, f)))
      )
      .join("\n");
    const tlsChainFile = "docker/docker-data/orgb-tls-chain.pem";
    fs.writeFileSync(tlsChainFile, chain);

    caConfig = {
      url: "https://localhost:7210",
      tls: {
        trustedRoots: [tlsChainFile],
        verify: true,
      },
      caName: "orgb-ca",
      // registrar is the CA bootstrap identity (orgb.ca)
      caCert: "./docker/docker-data/client/client/msp/signcerts",
      caKey: "./docker/docker-data/client/client/msp/keystore",
    };

    peerConfig = {
      cryptoPath: "./docker/docker-data/client",
      keyCertOrDirectoryPath: "",
      certCertOrDirectoryPath: "",
      tlsCert: fs.readFileSync(tlsChainFile),
      peerEndpoint: "localhost:7250",
      peerHostAlias: "localhost",
      chaincodeName: contractName,
      ca: "orgb-ca",
      mspId: "OrgbMSP",
      channel: "simple-channel",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const adapter = new FabricClientAdapter({
      ...peerConfig,
    });

    repository = Repository.forModel(OtherProduct);
  });

  let client: {
    keyCertOrDirectoryPath: any;
    certCertOrDirectoryPath: any;
  };

  it("Create User Account", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    );

    const credentials = userID.credentials;

    expect(userID).toBeDefined();
    expect(credentials).toBeDefined();
    expect(userID.id).toBeDefined();
    expect(userID.mspId).toEqual("orgb-ca");
    expect(userID.type).toBeDefined();
    expect(credentials?.certificate).toBeDefined();
    expect(credentials?.id).toBeDefined();
    expect(credentials?.privateKey).toBeDefined();
    expect(credentials?.rootCertificate).toBeDefined();

    client = {
      keyCertOrDirectoryPath: Buffer.from(
        credentials.privateKey!
      ) as unknown as string,
      certCertOrDirectoryPath: Buffer.from(
        credentials.certificate!
      ) as unknown as string,
    };
  });

  /**
   * Generates a random valid GTIN (14 digits including the GS1 check digit),
   * so every run creates a fresh OtherProduct and stays idempotent.
   */
  function generateGtin(): string {
    const beforeChecksum = (
      Math.floor(Math.random() * 9999999999999) + ""
    ).padStart(13, "0");
    const multiplier = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
    const sum = beforeChecksum
      .split("")
      .reduce((acc, digit, i) => acc + parseInt(digit, 10) * multiplier[i], 0);
    const remainder = sum % 10;
    const checksum = remainder === 0 ? 0 : 10 - remainder;
    return `${beforeChecksum}${checksum}`;
  }

  it("Should create one", async () => {
    const repo = repository.for({ ...client });

    const productCode = generateGtin();
    const created = await repo
      .override({
        // @ts-expect-error because ts?
        endorseTimeout: 60,
        evaluateTimeout: 60,
        submitTimeout: 60,
        commitTimeout: 240,
      })
      .create(
        new OtherProduct({
          productCode,
          inventedName: "orgb client test",
          nameMedicinalProduct: "orgb client test",
          productRecall: false,
        })
      );

    expect(created).toBeDefined();
    expect(created.productCode).toEqual(productCode);
    expect(created.hasErrors()).toEqual(undefined);

    const read = await repo.read(created.productCode);
    expect(read).toBeDefined();
    expect(read.productCode).toEqual(productCode);
  });
});
