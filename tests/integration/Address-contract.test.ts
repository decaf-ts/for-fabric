import { execSync } from "child_process";
import { ensureInfrastructureBooted } from "../utils";
import * as fs from "fs";
import * as path from "path";
import { CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricEnrollmentService } from "../../src/shared";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Paginator, Repository } from "@decaf-ts/core";
import { Address } from "../../src/contract/Address";
import { FabricClientRepository } from "../../src/client/index";

jest.setTimeout(3000000);

describe("Tests bulk and query operations", () => {
  const contractFolderName = "GlobalContract";
  const contractName = "GlobalContract";
  let caConfig: CAConfig;
  let peerConfig: PeerConfig;
  let repository: Repository<Address, any>;

  beforeAll(async () => {
    // Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const adapter = new FabricClientAdapter({
      ...peerConfig,
    });

    repository = Repository.forModel(Address);
    // userRepository = new FabricClientRepository(userAdapter, User);
    // productRepository = new FabricClientRepository(userAdapter, Product);
  });

  let client: {
    keyCertOrDirectoryPath: any;
    certCertOrDirectoryPath: any;
  };

  it.skip("Create User Account", async () => {
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
    // expect(userID.createdAt).toBeDefined();
    // expect(userID.updatedAt).toBeDefined();
    expect(credentials?.certificate).toBeDefined();
    // expect(credentials?.createdAt).toBeDefined();
    expect(credentials?.id).toBeDefined();
    expect(credentials?.privateKey).toBeDefined();
    expect(credentials?.rootCertificate).toBeDefined();
    // expect(credentials?.updatedAt).toBeDefined();

    client = {
      keyCertOrDirectoryPath: Buffer.from(
        credentials.privateKey!
      ) as unknown as string,
      certCertOrDirectoryPath: Buffer.from(
        credentials.certificate!
      ) as unknown as string,
    };
  });

  let created: Address[];

  it.skip("Should create one", async () => {
    const repo = repository.for({ ...client });

    const created = await repo.create(
      new Address({
        city: "city",
        street: "street",
        number: 0,
      })
    );

    expect(created).toBeDefined();
    expect(created.hasErrors()).toEqual(undefined);
  });

  it("Should create Addresses in bulk", async () => {
    const repo = repository.for({ ...client });

    const models = Object.keys(new Array(10).fill(0))
      .map(parseInt)
      .map(
        (el, i) =>
          new Address({
            city: "city" + i,
            street: "street",
            number: i,
          })
      );

    created = await repo
      .override({
        // @ts-expect-error because ts?
        endorseTimeout: 60,
        evaluateTimeout: 60,
        submitTimeout: 60,
        commitTimeout: 240,
      })
      .createAll(models);

    expect(created).toBeDefined();
    expect(created.length).toEqual(models.length);
    expect(created.every((c) => !c.hasErrors())).toEqual(true);
  });

  it("Should read Addresses in bulk", async () => {
    const repo = repository.for({ ...client });

    const ids = created.map((c) => c.id).slice(3, 5);

    const read = await repo.readAll(ids);

    expect(read).toBeDefined();
    expect(read.length).toEqual(ids.length);
  });

  it("Should update Addresses in bulk", async () => {
    const enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = (await enrollmentService.registerAndEnroll(
      { userName: "TestOtherUser" + Date.now(), password: "TestUserPW" },
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

    const repo = repository.for({ ...client });

    const toUpdate = created.slice(0, 5).map((c: Address) => {
      c.city = "Lisbon";
      return c;
    });

    const updated = await repo.updateAll(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.length).toEqual(toUpdate.length);
    expect(updated.every((r, i) => r.equals(created[i]))).toEqual(false);
    expect(
      updated.every((r, i) =>
        r.equals(created[i], "updatedAt", "updatedBy", "city", "version")
      )
    ).toEqual(true);
  });

  it("Should delete Addresses in bulk", async () => {
    const repo = repository.for({ ...client });

    const ids = created.map((c) => c.id).slice(3, 5);

    const deleted = await repo.deleteAll(ids);

    expect(deleted).toBeDefined();
    expect(deleted.length).toEqual(ids.length);
    for (const id of ids) {
      await expect(repo.read(id)).rejects.toThrow(NotFoundError);
    }

    created.splice(3, 5);
    await expect(repo.readAll(ids)).rejects.toThrow(NotFoundError);
  });

  it("should perform simple queries", async () => {
    const repo = repository.for({ ...client });

    const list = await repo.select().execute();

    expect(list).toBeDefined();
    expect(list.every((el) => el instanceof Address)).toEqual(true);
  });

  it.only("should perform paged queries", async () => {
    const repo = repository.for({ ...client });

    const page = await repo.select().paginate(10);

    expect(page).toBeDefined();
    expect(page).toBeInstanceOf(Paginator);

    const firstPage = await page.page();

    expect(firstPage).toBeDefined();
    expect(firstPage.length).toEqual(10);
    expect(firstPage.every((el) => el instanceof Address)).toEqual(true);
  });
});
