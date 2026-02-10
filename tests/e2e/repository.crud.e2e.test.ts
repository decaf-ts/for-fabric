/* eslint-disable @typescript-eslint/no-unused-vars */

import { E2eConfig } from "./e2e.config";
import {
  Observer,
  OrderDirection,
  PersistenceKeys,
  Repo,
  Repository,
} from "@decaf-ts/core";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Product } from "../../src/contract/models/Product";
import { generateGtin } from "../../src/contract/models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { Logging, LogLevel, style } from "@decaf-ts/logging";
import { CAConfig, PeerConfig } from "../../src/shared/index";
import { FabricClientRepository } from "../../src/client/index";
import { ensureInfrastructureBooted } from "../utils";
import { execSync } from "child_process";
import { ProductStrength } from "../../src/contract/models/ProductStrength";
import { Market } from "../../src/contract/models/Market";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

jest.setTimeout(50000);

describe("e2e Repository test", () => {
  let created: Product;

  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Product>;
  let observer: Observer;
  let mock: jest.Func;

  let contextFactoryMock: jest.SpyInstance;
  let adapterContextFactory: any;
  let bulk: Product[];

  const contractName = "GlobalContract";

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

  const peerConfig: PeerConfig = {
    cryptoPath: "./docker/infrastructure/crypto-config",
    keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
    certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
    tlsCert: "./docker/docker-data/tls-ca-cert.pem",
    peerEndpoint: "localhost:7031",
    peerHostAlias: "localhost",
    chaincodeName: contractName,
    ca: "org-a",
    mspId: "Peer0OrgaMSP",
    channel: "simple-channel",
  };
  //
  // function MockCtxFactory(
  //   op: string,
  //   overrides: Partial<any>,
  //   model: Constructor,
  //   ...args: any[]
  // ) {
  //   const log = logger
  //     .for(style("adapter context factory").green.bold)
  //     .for(expect.getState().currentTestName);
  //   try {
  //     log.info(
  //       `adapter context called with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
  //     );
  //   } catch (e: unknown) {
  //     log.warn(
  //       `adapter context called with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
  //     );
  //   }
  //   return adapterContextFactory(op, overrides, model, ...args);
  // }

  beforeAll(async () => {
    // Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`, {
      stdio: "inherit",
    });

    adapter = await adapterFactory(peerConfig);
    repo = Repository.forModel(Clazz);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();

    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    // repo.observe(observer);
  });

  afterEach(() => {
    // repo.unObserve(observer);
  });

  describe("Basic Crud", () => {
    it("creates", async () => {
      const id = generateGtin();
      const model = new Product({
        productCode: id,
        inventedName: "test_name",
        nameMedicinalProduct: "123456789",
        strengths: [
          {
            productCode: id,
            strength: "200mg",
            substance: "Ibuprofen",
          },
          {
            productCode: id,
            strength: "400mg",
            substance: "Ibuprofen",
          },
        ],
        markets: [
          {
            productCode: id,
            marketId: "BR",
            nationalCode: "BR",
            mahName: "ProPharma BR",
          },
          {
            productCode: id,
            marketId: "US",
            nationalCode: "US",
            mahName: "ProPharma US",
          },
        ],
      });

      created = await repo.create(model);

      expect(created).toBeDefined();
      expect(created.hasErrors()).toBeUndefined();
      expect(created.markets.length).toEqual(2);
      expect(created.strengths.length).toEqual(2);
      expect(created.version).toEqual(1);

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      const strengths = await strengthsRepo.readAll(
        created.strengths as unknown as string[]
      );
      const markets = await marketRepo.readAll(
        created.markets as unknown as string[]
      );

      expect(strengths.every((s) => s.version === 1)).toBe(true);
      expect(markets.every((m) => m.version === 1)).toBe(true);
    });

    it("reads", async () => {
      const read = await repo.read(created.productCode);

      expect(read).toBeDefined();
      expect(read.equals(created)).toEqual(true); // same model
      expect(read === created).toEqual(false); // different instances;

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      const strengths = await strengthsRepo.readAll(
        read.strengths as unknown as string[]
      );
      const markets = await marketRepo.readAll(
        read.markets as unknown as string[]
      );

      expect(strengths.every((s) => s.version === 1)).toBe(true);
      expect(markets.every((m) => m.version === 1)).toBe(true);
    });

    it("updates", async () => {
      const toUpdate = new Product(
        Object.assign({}, created, {
          inventedName: "new_test_name",
        })
      );

      const updated = await repo.update(toUpdate);

      expect(updated).toBeDefined();
      expect(updated.equals(created)).toEqual(false);
      expect(
        updated.equals(
          created,
          "updatedAt",
          "inventedName",
          "updatedBy",
          "version"
        )
      ).toEqual(true); // minus the expected changes

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      const strengths = await strengthsRepo.readAll(
        updated.strengths as unknown as string[]
      );
      const markets = await marketRepo.readAll(
        updated.markets as unknown as string[]
      );

      expect(strengths.every((s) => s.version === 1)).toBe(true);
      expect(markets.every((m) => m.version === 1)).toBe(true);
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.productCode as string);

      expect(deleted).toBeDefined();
      expect(deleted.productCode).toEqual(created.productCode); // same model
      await expect(
        repo.read(created.productCode as string)
      ).rejects.toThrowError(NotFoundError);

      const strengthRepo = Repository.forModel(ProductStrength);
      await expect(
        strengthRepo.read(deleted.strengths[0] as unknown as string)
      ).rejects.toThrowError(NotFoundError);
      await expect(
        strengthRepo.read(deleted.strengths[1] as unknown as string)
      ).rejects.toThrowError(NotFoundError);

      const marketRepo = Repository.forModel(Market);
      await expect(
        marketRepo.read(deleted.markets[0] as any)
      ).resolves.toBeInstanceOf(Market);
      await expect(
        marketRepo.read(deleted.markets[1] as any)
      ).resolves.toBeInstanceOf(Market);
    });
  });

  describe("Bulk Crud", () => {
    it("Creates in bulk", async () => {
      const models = new Array(10).fill(0).map(() => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "test_name",
          nameMedicinalProduct: "123456789",
          strengths: [
            {
              productCode: id,
              strength: "200mg",
              substance: "Ibuprofen",
            },
            {
              productCode: id,
              strength: "400mg",
              substance: "Ibuprofen",
            },
          ],
          markets: [
            {
              productCode: id,
              marketId: "BR",
              nationalCode: "BR",
              mahName: "ProPharma BR",
            },
            {
              productCode: id,
              marketId: "US",
              nationalCode: "US",
              mahName: "ProPharma US",
            },
          ],
        });
      });
      bulk = await repo.createAll(models);
      expect(bulk).toBeDefined();
      expect(Array.isArray(bulk)).toEqual(true);
      expect(bulk.every((el) => el instanceof Product)).toEqual(true);
      expect(bulk.every((el) => !el.hasErrors())).toEqual(true);

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      for (const created of bulk) {
        const strengths = await strengthsRepo.readAll(
          created.strengths as unknown as string[]
        );
        const markets = await marketRepo.readAll(
          created.markets as unknown as string[]
        );

        expect(strengths.every((s) => s.version === 1)).toBe(true);
        expect(markets.every((m) => m.version === 1)).toBe(true);
      }
    });

    it("Reads in Bulk", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);
      const ids = bulk.map((c) => c[pk]) as number[];
      const read = await repo.readAll(ids);
      expect(read).toBeDefined();
      expect(Array.isArray(read)).toEqual(true);
      expect(read.every((el) => el instanceof Product)).toEqual(true);
      expect(read.every((el) => !el.hasErrors())).toEqual(true);
      expect(
        read.every((el, i) => {
          const equals = el.equals(bulk[i]);
          if (!equals)
            console.log(
              `element ${i} is different ${JSON.stringify(el.compare(bulk[i]))}`
            );
          return equals;
        })
      ).toEqual(true);
      expect(read.every((el) => !!(el as any)[PersistenceKeys.METADATA]));

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      for (const r of read) {
        const strengths = await strengthsRepo.readAll(
          r.strengths as unknown as string[]
        );
        const markets = await marketRepo.readAll(
          r.markets as unknown as string[]
        );

        expect(strengths.every((s) => s.version === 1)).toBe(true);
        expect(markets.every((m) => m.version === 1)).toBe(true);
      }
    });

    let updated: Product[];

    it("Updates in Bulk", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);
      const toUpdate = bulk.map((c, i) => {
        return new Product({
          productCode: c.productCode,
          inventedName: "inventedName_" + i,
        });
      });
      updated = await repo.updateAll(toUpdate);
      expect(updated).toBeDefined();
      expect(Array.isArray(updated)).toEqual(true);
      expect(updated.every((el) => el instanceof Product)).toEqual(true);
      expect(updated.every((el) => !el.hasErrors())).toEqual(true);
      expect(updated.every((el, i) => el.equals(bulk[i]))).toEqual(false);
      expect(
        updated.every((el, i) =>
          el.equals(bulk[i], "inventedName", "updatedAt", "version")
        )
      ).toEqual(true);

      const marketRepo = Repository.forModel(Market);
      const strengthsRepo = Repository.forModel(ProductStrength);

      for (const created of updated) {
        const strengths = await strengthsRepo.readAll(
          created.strengths as unknown as string[]
        );
        const markets = await marketRepo.readAll(
          created.markets as unknown as string[]
        );

        expect(strengths.every((s) => s.version === 1)).toBe(true);
        expect(markets.every((m) => m.version === 1)).toBe(true);
      }
    });

    it("lists", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);

      const list = await repo.listBy("inventedName", OrderDirection.ASC);
      expect(list).toBeDefined();
      // expect(list.every((el) => el instanceof Product)).toEqual(true);
    });

    it("Paginates", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);
      const paginator = await repo.select().paginate(5);
      expect(paginator).toBeDefined();
      expect(paginator["_bookmark"]).toBeUndefined();
      const page1 = await paginator.page(1);
      expect(paginator.count).toBeGreaterThan(9);
      expect(page1).toBeDefined();
      expect(paginator["_bookmark"]).toBeDefined();
      // expect(
      //   page1.every((el, i) => el.equals([...updated].reverse()[i]))
      // ).toEqual(true);

      const page2 = await paginator.next();
      // expect(paginator.count).toBeGreaterThan(9);
      expect(page2).toBeDefined();
      expect(paginator["_bookmark"]).toBeDefined();
      // expect(
      //   page2.every((el, i) => el.equals([...updated].reverse()[i + 5]))
      // ).toEqual(true);
    });

    it("Deletes in Bulk", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);
      const ids = bulk.map((c) => c[pk]);
      const deleted = await repo.deleteAll(ids as any[]);
      expect(deleted).toBeDefined();
      expect(Array.isArray(deleted)).toEqual(true);
      expect(deleted.every((el) => el instanceof Product)).toEqual(true);
      expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
      expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);
      //
      // const strengthRepo = Repository.forModel(ProductStrength);
      //
      // const marketRepo = Repository.forModel(Market);
      //
      // for (const p of deleted) {
      //   await expect(repo.read(p[Model.pk(Clazz) as any])).rejects.toThrowError(
      //     NotFoundError
      //   );
      //   await expect(strengthRepo.read(p.strengths[0].id)).rejects.toThrowError(
      //     NotFoundError
      //   );
      //   await expect(strengthRepo.read(p.strengths[1].id)).rejects.toThrowError(
      //     NotFoundError
      //   );
      //
      //   await expect(
      //     marketRepo.read(p.markets[0] as any)
      //   ).resolves.toBeInstanceOf(Market);
      //   await expect(
      //     marketRepo.read(p.markets[1] as any)
      //   ).resolves.toBeInstanceOf(Market);
      // }
    });
  });
});
