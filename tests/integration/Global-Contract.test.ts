import { execSync } from "child_process";
import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils";
import fs from "fs";
import path from "path";
import { CAConfig } from "../../src/shared/types";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricEnrollmentService, FabricFlavour } from "../../src/shared";
import { User } from "../../src/contract/User";
import { Product } from "../../src/contract/Product";
import { UserContract } from "../../src/contract/UserContract";
import { ProductContract } from "../../src/contract/ProductContract";

jest.setTimeout(3000000);

describe("Tests global contract implementation", () => {
  const contractFolderName = "global";
  const contractName = "global";
  let caConfig: CAConfig;
  let peerConfig: any;
  let userAdapter: FabricClientAdapter;
  let productAdapter: FabricClientAdapter;
  let userRepository: FabricClientRepository<User>;
  let productRepository: FabricClientRepository<Product>;

  beforeAll(async () => {
    // Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);
    // Ensure Infrastructure is ready
    await ensureInfrastructureBooted();
    const location = path.join(
      __dirname,
      "../../docker/infrastructure/chaincode",
      contractFolderName
    );
    if (!fs.existsSync(location)) {
      execSync("npm run build:contract");
      execSync(
        `cp -r  ${path.join(__dirname, "../..", contractFolderName)} ${path.join(__dirname, "../../docker/infrastructure/chaincode")}/`
      );
      deployContract(contractFolderName, contractName);
      commitChaincode(contractName);
    }
    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`);

    caConfig = {
      url: "https://localhost:7011",
      tls: {
        trustedRoots: ["./docker/docker-data/tls-ca-cert.pem"],
        verify: true,
      },
      caName: "org-a",
      caCert: "./docker/docker-data/admin/msp/signcerts",
      caKey: "./docker/docker-data/admin/msp/keystore",
    };

    peerConfig = {
      cryptoPath: "./docker/infrastructure/crypto-config",
      keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
      certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
      tlsCert: fs.readFileSync("./docker/docker-data/tls-ca-cert.pem"),
      peerEndpoint: "localhost:7031",
      peerHostAlias: "localhost",
      chaincodeName: contractName,
      ca: "org-a",
      mspId: "Peer0OrgaMSP",
      channel: "simple-channel",
    };

    userAdapter = new FabricClientAdapter(
      {
        ...peerConfig,
        contractName: UserContract.name,
      },
      FabricFlavour + UserContract.name
    );
    productAdapter = new FabricClientAdapter(
      {
        ...peerConfig,
        contractName: ProductContract.name,
      },
      FabricFlavour + ProductContract.name
    );
    userRepository = new FabricClientRepository(userAdapter, User);
    productRepository = new FabricClientRepository(productAdapter, Product);
  });

  it("Create User", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    );

    expect(userID).toBeDefined();
  });

  it("Should create User", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = userRepository.for({ ...client });

    const m = new User({ name: "juan" });

    const res = await repo.create(m);

    console.log(res);
  });

  it("Should create Product", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = productRepository.for({ ...client });

    const m = new Product({ inventedName: "juanito" });

    const res = await repo.create(m);

    console.log(res);
  });
});
