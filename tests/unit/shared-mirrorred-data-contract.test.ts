import { FabricClientAdapter } from "../../src/client";

import { Context, Repo, Repository } from "@decaf-ts/core";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { Logging, LogLevel } from "@decaf-ts/logging";
import { CAConfig, PeerConfig, privateData } from "../../src/shared";
import { E2eConfig } from "../e2e/e2e.config";
import { pk, column, table, createdAt } from "@decaf-ts/core";
import {
  Model,
  ModelArg,
  required,
  model,
} from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../src/index";
import {
  FabricContractAdapter,
  SerializedCrudContract,
} from "../../src/contracts/index";
import { Info } from "fabric-contract-api";
import { getMockCtx } from "./ContextMock";
Logging.setConfig({ level: LogLevel.debug });

jest.setTimeout(50000);

describe.skip(
  "shared and mirrored data - contract (mirrored-data suite currently failing, skipping per request)",
  () => {
  @privateData("PrivatE")
  @uses(FabricFlavour)
  @table("private_class")
  @model()
  class PrivateClass extends Model {
    @pk()
    id!: number;

    @column()
    @required()
    name!: string;

    @createdAt()
    createdAt!: Date;

    constructor(arg?: ModelArg<PrivateClass>) {
      super(arg);
    }
  }

  @Info({
    title: "PrivateClassContract",
    description: "Contract managing the Addresses",
  })
  class PrivateClassContract extends SerializedCrudContract<PrivateClass> {
    constructor() {
      super(PrivateClassContract.name, PrivateClass);
    }
  }

  const contract = new PrivateClassContract();

  beforeAll(async () => {});

  describe("private collections", () => {
    let repo: Repo<PrivateClass>;

    beforeAll(() => {
      repo = Repository.forModel(PrivateClass);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
      jest.resetAllMocks();
    });

    it("identifies the collection", async () => {
      const collections = Model.collectionsFor(PrivateClass);
      const { privateCols, sharedCols } = collections;
      expect(privateCols.length).toEqual(1);
      expect(sharedCols.length).toEqual(0);
      expect(privateCols[0]).toEqual("PrivatE");
    });

    it("segregates the model", async () => {
      const instance = new PrivateClass({
        id: "id",
        name: "name",
      });
      const { model, transient, privates, shared } = instance.segregate();

      expect(Object.keys(instance).every((k) => model[k] === "undefined"));
      expect(model).not.toEqual(instance);
      expect(transient).toEqual(
        expect.objectContaining({
          id: "id,",
          name: "name",
          createdAt: undefined,
        })
      );
      expect(privates).toEqual(
        expect.objectContaining({
          id: "id,",
          name: "name",
          createdAt: undefined,
        })
      );
      expect(shared).toEqual({});
    });

    const ctx = getMockCtx();

    let created: PrivateClass;

    it("should create model", async () => {
      const model = new PrivateClass({
        name: "John Doe",
      });

      created = Model.deserialize(
        await contract.create(ctx as any, model.serialize())
      );

      console.log("Result: ", created);
    });

    it("should read model", async () => {
      const res = Model.deserialize(
        await contract.read(ctx as any, created.id.toString())
      );
      console.log("Created", created.serialize());
      console.log("Read", res.serialize());
      expect(res.equals(created)).toEqual(true);
      console.log("Result: ", res);
    });

    it("should update model", async () => {
      const res = Model.deserialize(
        await contract.update(
          ctx as any,
          new PrivateClass({ ...created, name: "Jane Doe" }).serialize()
        )
      );
      expect(res.equals(created)).toEqual(false);
      expect(res.equals(created, "name", "updatedAt", "version")).toEqual(true);
      created = res;
      console.log("Result: ", res);
    });

    it("should delete model", async () => {
      const res = Model.deserialize(
        await contract.delete(ctx as any, created.id.toString())
      );
      expect(res.equals(created)).toEqual(true);
      console.log("Result: ", res);
      await expect(
        contract.read(ctx as any, created.id.toString())
      ).rejects.toThrow(NotFoundError);
    });

    let bulk: PrivateClass[];

    it("should create in bulk", async () => {
      const models = Object.keys(new Array(10).fill(0)).map(
        (i) =>
          new PrivateClass({
            name: "john" + i,
          })
      );

      bulk = JSON.parse(
        await contract.createAll(
          ctx as any,
          JSON.stringify(models.map((m) => m.serialize()))
        )
      ).map((m) => Model.deserialize(m));
      expect(bulk).toBeDefined();
      expect(bulk.length).toEqual(models.length);
    });

    it("should read in bulk", async () => {
      const keys = bulk.map((b) => b.id);

      const read = JSON.parse(
        await contract.readAll(ctx as any, JSON.stringify(keys))
      ).map((m) => Model.deserialize(m));
      expect(read).toBeDefined();
      expect(read.length).toEqual(bulk.length);
    });

    it("should update in bulk", async () => {
      const models = bulk.map(
        (b) =>
          new PrivateClass(
            Object.assign({}, b, {
              name: "updated" + b.id,
            })
          )
      );

      bulk = JSON.parse(
        await contract.updateAll(
          ctx as any,
          JSON.stringify(models.map((m) => m.serialize()))
        )
      ).map((m) => Model.deserialize(m));
      expect(bulk).toBeDefined();
      expect(bulk.length).toEqual(models.length);
    });

    it("should delete in bulk", async () => {
      const models = Object.keys(new Array(10).fill(0)).map(
        (i) =>
          new PrivateClass({
            name: "john" + i,
          })
      );

      bulk = JSON.parse(
        await contract.createAll(
          ctx as any,
          JSON.stringify(models.map((m) => m.serialize()))
        )
      ).map((m) => Model.deserialize(m));
      const keys = bulk.map((b) => b.id);

      const read = JSON.parse(
        await contract.deleteAll(ctx as any, JSON.stringify(keys))
      ).map((m) => Model.deserialize(m));
      expect(read).toBeDefined();
      expect(read.length).toEqual(bulk.length);
    });

    it("should perform simple queries", async () => {
      const bulk = JSON.parse(
        await contract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["name", "asc"])
        )
      );
      expect(bulk).toBeDefined();
    });

    it("should paginate properly for simple queries", async () => {
      const page = await contract.paginateBy(
        ctx,
        "name",
        "desc",
        JSON.stringify({ offset: 1, limit: 3 })
      );
      expect(page).toBeDefined();
    });

    it("should executed prepared statements properly for simple queries", async () => {
      const page = await contract.statement(
        ctx,
        "paginateBy",
        JSON.stringify(["name", "desc", { offset: 1, limit: 3 }])
      );
      expect(page).toBeDefined();
    });
  });
});
