/* eslint-disable @typescript-eslint/no-unused-vars */
import { E2eConfig } from "./e2e.config";
import { Repo, Repository } from "../../src/repository/Repository";
import { Context, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { generateGtin } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Observer, OrderDirection } from "../../src/index";
import { Logging, LogLevel, style } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
Logging.setConfig({ level: LogLevel.debug });

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository query test", () => {
  let created: Product;

  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Product>;
  let observer: Observer;
  let mock: jest.Func;

  let contextFactoryMock: jest.SpyInstance;
  let bulk: Product[];

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

  describe("Querying", () => {
    it("Creates to query", async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const i = 9 - index;
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + i,
          nameMedicinalProduct: "medicine" + i,
          counter: i,
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

      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.CREATE,
        bulk.map((b) => b[pk]),
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("performs simple selects", async () => {
      const selected = await repo.select().execute();
      expect(selected).toBeDefined();
      const selectedIds = selected.map((el) => el[pk]).sort();
      const bulkIds = bulk.map((el) => el[pk]).sort();
      expect(selectedIds).toEqual(bulkIds);
    });

    it("performs sorted selects on numbers", async () => {
      let selected = await repo
        .select()
        .orderBy(["counter", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });

    it("performs sorted selects on strings", async () => {
      let selected = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });

    it("performs sorted selects on dates", async () => {
      let selected = await repo
        .select()
        .orderBy(["createdAt", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["createdAt", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });
  });
});
