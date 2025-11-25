import { execSync } from "child_process";
import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils";
import * as fs from "fs";
import * as path from "path";
import { CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricEnrollmentService } from "../../src/shared";
import { User } from "../../src/contract/User";
import { Product } from "../../src/contract/Product";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Repository } from "@decaf-ts/core";

jest.setTimeout(3000000);

describe("Tests global contract implementation", () => {
  const contractFolderName = "global";
  const contractName = "global";
  let caConfig: CAConfig;
  let peerConfig: any;
  let userAdapter: FabricClientAdapter;
  let userRepository: FabricClientRepository<User>;
  let productRepository: FabricClientRepository<Product>;

  const useHsm = false;

  beforeAll(async () => {
    //Creates hsm folder
    fs.mkdirSync(
      path.join(__dirname, "../../docker/infrastructure/storage/softhsm/orghsm")
    );

    // Boot infrastructure for testing
    execSync(`npm run infrastructure${useHsm ? "-hsm" : ""}:up`, {
      stdio: "inherit",
    });
    // Ensure Infrastructure is ready
    await ensureInfrastructureBooted();
    const location = path.join(
      __dirname,
      "../../docker/infrastructure/chaincode",
      contractFolderName
    );
    if (!fs.existsSync(location)) {
      execSync("npm run build:contract", { stdio: "inherit" });
      execSync(
        `cp -r  ${path.join(__dirname, "../..", contractFolderName)} ${path.join(__dirname, "../../docker/infrastructure/chaincode")}/`,
        { stdio: "inherit" }
      );
      deployContract(contractFolderName, contractName);
      commitChaincode(contractName);
    }
    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`, {
      stdio: "inherit",
    });

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

    userAdapter = new FabricClientAdapter({
      ...peerConfig,
    });

    userRepository = Repository.forModel(User);
    productRepository = Repository.forModel(Product);
    // userRepository = new FabricClientRepository(userAdapter, User);
    // productRepository = new FabricClientRepository(userAdapter, Product);
  });

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
    expect(userID.mspId).toBeDefined();
    expect(userID.type).toBeDefined();
    // expect(userID.createdOn).toBeDefined();
    // expect(userID.updatedOn).toBeDefined();
    expect(credentials?.certificate).toBeDefined();
    // expect(credentials?.createdOn).toBeDefined();
    expect(credentials?.id).toBeDefined();
    expect(credentials?.privateKey).toBeDefined();
    expect(credentials?.rootCertificate).toBeDefined();
    // expect(credentials?.updatedOn).toBeDefined();
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
    expect(credentials).toBeDefined();

    const client: Partial<PeerConfig> = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = userRepository.for({ ...client });

    const m = new User({ name: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.name).toEqual(m.name);
    expect(created.id).toBeDefined();

    console.log(created);

    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.name).toEqual(created.name);
    expect(read.id).toEqual(created.id);

    console.log(read);
  });

  it("Should Update User", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = userRepository.for({ ...client });

    const m = new User({ name: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.name).toEqual(m.name);
    expect(created.id).toBeDefined();

    console.log(created);

    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.name).toEqual(created.name);
    expect(read.id).toEqual(created.id);

    console.log(read);

    const newName = "Alice";

    read.name = newName;

    expect(read.name).toEqual(newName);

    const updated = await repo.update(read);

    expect(updated).toBeDefined();
    expect(read.name).toEqual(updated.name);
    expect(read.id).toEqual(updated.id);

    console.log(updated);

    const readUpdated = await repo.read(updated.id);

    expect(readUpdated).toBeDefined();
    expect(readUpdated.name).toEqual(updated.name);
    expect(readUpdated.id).toEqual(updated.id);

    console.log(readUpdated);
  });

  it("Should Read User", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = userRepository.for({ ...client });

    const m = new User({ name: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.name).toEqual(m.name);
    expect(created.id).toBeDefined();

    console.log(created);

    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.name).toEqual(created.name);
    expect(read.id).toEqual(created.id);

    console.log(read);
  });

  it("Should Delete User", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = userRepository.for({ ...client });

    const m = new User({ name: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.name).toEqual(m.name);
    expect(created.id).toBeDefined();

    console.log(created);

    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.name).toEqual(created.name);
    expect(read.id).toEqual(created.id);

    console.log(read);

    const deleted = await repo.delete(read.id);

    expect(deleted).toBeDefined();
    expect(read.name).toEqual(deleted.name);
    expect(read.id).toEqual(deleted.id);

    console.log(deleted);

    let triggered = false;
    try {
      const readDeleted = await repo.read(read.id);
      expect(readDeleted).toBeUndefined();
    } catch (e: unknown) {
      expect(e).toBeDefined();
      const error = e as NotFoundError;
      triggered = true;
      expect(error.code).toEqual(500);
      expect(
        error.message.includes(`Record with id ${read.id} not found`)
      ).toEqual(true);
    }

    expect(triggered).toEqual(true);
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
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = productRepository.for({ ...client });

    const m = new Product({ inventedName: "juanito" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.inventedName).toEqual(m.inventedName);
    expect(created.productCode).toBeDefined();

    console.log(created);

    const read = await repo.read(created.productCode);

    expect(read).toBeDefined();
    expect(read.inventedName).toEqual(created.inventedName);
    expect(read.productCode).toEqual(created.productCode);

    console.log(read);
  });

  it("Should Update Product", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = productRepository.for({ ...client });

    const m = new Product({ inventedName: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.inventedName).toEqual(m.inventedName);
    expect(created.productCode).toBeDefined();

    console.log(created);

    const read = await repo.read(created.productCode);

    expect(read).toBeDefined();
    expect(read.inventedName).toEqual(created.inventedName);
    expect(read.productCode).toEqual(created.productCode);

    console.log(read);

    const newName = "Alice";

    read.inventedName = newName;

    expect(read.inventedName).toEqual(newName);

    const updated = await repo.update(read);

    expect(updated).toBeDefined();
    expect(read.inventedName).toEqual(updated.inventedName);
    expect(read.productCode).toEqual(updated.productCode);

    console.log(updated);

    const readUpdated = await repo.read(updated.productCode);

    expect(readUpdated).toBeDefined();
    expect(readUpdated.inventedName).toEqual(updated.inventedName);
    expect(readUpdated.productCode).toEqual(updated.productCode);

    console.log(readUpdated);
  });

  it("Should Read Product", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = productRepository.for({ ...client });

    const m = new Product({ inventedName: "juanito" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.inventedName).toEqual(m.inventedName);
    expect(created.productCode).toBeDefined();

    console.log(created);

    const read = await repo.read(created.productCode);

    expect(read).toBeDefined();
    expect(read.inventedName).toEqual(created.inventedName);
    expect(read.productCode).toEqual(created.productCode);

    console.log(read);
  });

  it("Should Delete Product", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestUser" + Date.now(), password: "TestUserPW" },
      false,
      "",
      "client"
    )) as any;

    expect(userID).toBeDefined();
    const credentials = userID.credentials;
    expect(credentials).toBeDefined();

    const client = {
      keyCertOrDirectoryPath: Buffer.from(credentials.privateKey!),
      certCertOrDirectoryPath: Buffer.from(credentials.certificate!),
    };

    const repo = productRepository.for({ ...client });

    const m = new Product({ inventedName: "juan" });

    const created = await repo.create(m);

    expect(created).toBeDefined();
    expect(created.inventedName).toEqual(m.inventedName);
    expect(created.inventedName).toBeDefined();

    console.log(created);

    const read = await repo.read(created.productCode);

    expect(read).toBeDefined();
    expect(read.inventedName).toEqual(created.inventedName);
    expect(read.productCode).toEqual(created.productCode);

    console.log(read);

    const deleted = await repo.delete(read.productCode);

    expect(deleted).toBeDefined();
    expect(read.inventedName).toEqual(deleted.inventedName);
    expect(read.productCode).toEqual(deleted.productCode);

    console.log(deleted);

    let triggered = false;
    try {
      const readDeleted = await repo.read(read.productCode);
      expect(readDeleted).toBeUndefined();
    } catch (e: unknown) {
      expect(e).toBeDefined();
      const error = e as NotFoundError;
      triggered = true;
      expect(error.code).toEqual(500);
      expect(
        error.message.includes(`Record with id ${read.productCode} not found`)
      ).toEqual(true);
    }

    expect(triggered).toEqual(true);
  });
});
