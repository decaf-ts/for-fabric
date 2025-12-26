/* eslint-disable @typescript-eslint/no-unused-vars */
import { E2eConfig } from "./e2e.config";
import { Repo, Repository } from "../../src/repository/Repository";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Batch } from "./models/Batch";
import { generateGtin, getBatch } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Observer, PersistenceKeys, RamRepository } from "../../src/index";
import { Constructor } from "@decaf-ts/decoration";
import { Logging, LogLevel, style } from "@decaf-ts/logging";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Batch;

const pk = Model.pk(Batch);

describe("e2e Repository test", () => {
  let created: Batch;

  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Batch>;
  let observer: Observer;
  let mock: jest.Func;

  let contextFactoryMock: jest.SpyInstance;

  let bulk: Batch[];

  beforeAll(async () => {
    adapter = await adapterFactory();
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
    repo.observe(observer);

    const adapterContextFactory = adapter.context.bind(adapter);
    contextFactoryMock = jest
      .spyOn(adapter, "context")
      .mockImplementation(
        (
          op: string,
          overrides: Partial<any>,
          model: Constructor,
          ...args: any[]
        ) => {
          const log = logger
            .for(style("adapter context factory").green.bold)
            .for(expect.getState().currentTestName);
          try {
            log.info(
              `adapter context called with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
            );
          } catch (e: unknown) {
            log.warn(
              `adapter context called with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
            );
          }
          return adapterContextFactory(op, overrides, model, ...args);
        }
      );
  });

  afterEach(() => {
    repo.unObserve(observer);
  });

  describe("Basic Crud", () => {
    it("creates", async () => {
      const id = generateGtin();
      const batch = getBatch();
      const model = new Clazz({
        productCode: id,
        batchNumber: batch,
        expiryDate: new Date(),
      });

      created = await repo.create(model);

      expect(created.id).toEqual(`${id}:${batch}`);
      expect(created).toBeDefined();
      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.CREATE,
        created.id,
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("reads", async () => {
      const read = await repo.read(created.id);

      expect(read).toBeDefined();
      expect(read.equals(created)).toEqual(true); // same model
      expect(read === created).toEqual(false); // different instances
    });

    it("updates", async () => {
      const toUpdate = new Clazz(
        Object.assign({}, created, {
          expiryDate: new Date(),
        })
      );

      const updated = await repo.update(toUpdate);

      expect(updated).toBeDefined();
      expect(updated.equals(created)).toEqual(false);
      expect(
        updated.equals(
          created,
          "updatedAt",
          "expiryDate",
          "updatedBy",
          "version"
        )
      ).toEqual(true); // minus the expected changes
      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.UPDATE,
        updated.id,
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.id as string);

      expect(deleted).toBeDefined();
      expect(deleted.id).toEqual(created.id); // same model
      await expect(repo.read(created.id as string)).rejects.toThrowError(
        NotFoundError
      );
      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.DELETE,
        deleted.id,
        expect.any(Object),
        expect.any(Context)
      );
    });
  });

  describe("Bulk Crud", () => {
    it("Creates in bulk", async () => {
      const models = new Array(10).fill(0).map(() => {
        const id = generateGtin();
        const batch = getBatch();
        return new Batch({
          productCode: id,
          batchNumber: batch,
          expiryDate: new Date(),
        });
      });
      bulk = await repo.createAll(models);
      expect(bulk).toBeDefined();
      expect(Array.isArray(bulk)).toEqual(true);
      expect(bulk.every((el) => el instanceof Batch)).toEqual(true);
      expect(bulk.every((el) => !el.hasErrors())).toEqual(true);

      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.CREATE,
        bulk.map((b) => b[pk]),
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("Reads in Bulk", async () => {
      const repo: RamRepository<Batch> = Repository.forModel<
        Batch,
        RamRepository<Batch>
      >(Batch);
      const ids = bulk.map((c) => c[pk]) as number[];
      const read = await repo.readAll(ids);
      expect(read).toBeDefined();
      expect(Array.isArray(read)).toEqual(true);
      expect(read.every((el) => el instanceof Batch)).toEqual(true);
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
    });

    let updated: Batch[];

    it("Updates in Bulk", async () => {
      const repo: RamRepository<Batch> = Repository.forModel<
        Batch,
        RamRepository<Batch>
      >(Batch);
      const toUpdate = bulk.map((c, i) => {
        return new Batch({
          id: c.id,
          expiryDate: new Date(),
        });
      });
      updated = await repo.updateAll(toUpdate);
      expect(updated).toBeDefined();
      expect(Array.isArray(updated)).toEqual(true);
      expect(updated.every((el) => el instanceof Batch)).toEqual(true);
      expect(updated.every((el) => !el.hasErrors())).toEqual(true);
      expect(updated.every((el, i) => el.equals(bulk[i]))).toEqual(false);
      expect(
        updated.every((el, i) =>
          el.equals(bulk[i], "expiryDate", "updatedAt", "version")
        )
      ).toEqual(true);

      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.UPDATE,
        updated.map((u) => u[pk]),
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("Deletes in Bulk", async () => {
      const repo: RamRepository<Batch> = Repository.forModel<
        Batch,
        RamRepository<Batch>
      >(Batch);
      const ids = bulk.map((c) => c[pk]);
      const deleted = await repo.deleteAll(ids as any[]);
      expect(deleted).toBeDefined();
      expect(Array.isArray(deleted)).toEqual(true);
      expect(deleted.every((el) => el instanceof Batch)).toEqual(true);
      expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
      expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);
      for (const k in deleted.map((c) => c[pk])) {
        await expect(repo.read(k)).rejects.toThrowError(NotFoundError);
      }
      expect(mock).toHaveBeenCalledWith(
        Batch,
        OperationKeys.DELETE,
        ids,
        expect.any(Object),
        expect.any(Context)
      );
    });
  });
});
