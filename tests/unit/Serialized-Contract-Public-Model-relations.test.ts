import { TestPublicModelContract } from "../assets/contract/serialized-contract-public-model/TestPublicModelContract";
import { TestPublicModel } from "../assets/contract/serialized-contract-public-model/TestPublicModel";
import { getMockCtx } from "./ContextMock";
import {
  maxlength,
  minlength,
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import {
  Cascade,
  column,
  oneToOne,
  pk,
  table,
  oneToMany,
} from "@decaf-ts/core";
import { FabricIdentifiedBaseModel, ownedBy } from "../../src/shared/index";
import { TestPublicModelChild } from "../assets/contract/serialized-contract-public-model/TestPublicModelChild";
import { SerializedCrudContract } from "../../src/index";

@table("tst_nested_model")
@model()
export class TestNestedModel extends FabricIdentifiedBaseModel {
  @pk({ type: "Number", generated: true })
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  @ownedBy()
  owner!: string;

  @oneToMany(
    () => TestPublicModelChild,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true
  )
  @required()
  children!: TestPublicModelChild[];

  constructor(arg?: ModelArg<TestPublicModel>) {
    super(arg);
  }
}

describe("Tests Public contract", () => {
  const ctx = getMockCtx();

  describe("oneToOne", () => {
    const contract = new TestPublicModelContract();
    let created: TestPublicModel;
    it("should create model", async () => {
      const model = new TestPublicModel({
        name: "John Doe",
        nif: "123456789",
        child: {
          name: "Child",
        },
      });

      created = new TestPublicModel(
        JSON.parse(await contract.create(ctx as any, model.serialize()))
      );

      expect(created.hasErrors()).toBeUndefined();
      console.log("Result: ", created);
    });

    it("should read model", async () => {
      const res = new TestPublicModel(
        JSON.parse(await contract.read(ctx as any, created.id.toString()))
      );
      expect(res.equals(created)).toEqual(true);
      console.log("Result: ", res);
    });

    it("should update model", async () => {
      const res = new TestPublicModel(
        JSON.parse(
          await contract.update(
            ctx as any,
            new TestPublicModel({ ...created, name: "Jane Doe" }).serialize()
          )
        )
      );
      expect(res.equals(created)).toEqual(false);
      expect(res.equals(created, "name", "updatedAt", "version")).toEqual(true);
      created = res;
      console.log("Result: ", res);
    });

    it("should delete model", async () => {
      const res = new TestNestedModel(
        JSON.parse(await contract.delete(ctx as any, created.id.toString()))
      );
      console.log("Result: ", res);
      await expect(
        contract.read(ctx as any, created.id.toString())
      ).rejects.toThrow(NotFoundError);
    });

    let bulk: TestPublicModel[];

    it("should create in bulk", async () => {
      const models = Object.keys(new Array(10).fill(0)).map(
        (i) =>
          new TestPublicModel({
            name: "john" + i,
            nif: "123456789",
            child: { name: "any" + i },
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
          new TestPublicModel(
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
      const keys = bulk.map((b) => b.id);

      const read = JSON.parse(
        await contract.deleteAll(ctx as any, JSON.stringify(keys))
      ).map((m) => Model.deserialize(m));
      expect(read).toBeDefined();
      expect(read.length).toEqual(bulk.length);
    });
  });
  describe("oneToMany", () => {
    let created: TestNestedModel;

    const contract =
      new (class TestNestedModelContract extends SerializedCrudContract<TestNestedModel> {
        constructor() {
          super(TestNestedModelContract.name, TestNestedModel);
        }
      })();

    it("should create model", async () => {
      const model = new TestNestedModel({
        name: "John Doe",
        nif: "123456789",
        children: [
          {
            name: "Child",
          },
        ],
      });

      created = new TestNestedModel(
        JSON.parse(await contract.create(ctx as any, model.serialize()))
      );

      expect(created.hasErrors()).toBeUndefined();
      expect(created.children).toBeInstanceOf(Array);
    });

    it("should read model", async () => {
      const res = new TestNestedModel(
        JSON.parse(await contract.read(ctx as any, created.id.toString()))
      );
      expect(res.equals(created)).toEqual(true);
      console.log("Result: ", res);
    });

    it("should update model", async () => {
      const res = new TestNestedModel(
        JSON.parse(
          await contract.update(
            ctx as any,
            new TestNestedModel({ ...created, name: "Jane Doe" }).serialize()
          )
        )
      );
      expect(res.equals(created)).toEqual(false);
      expect(res.equals(created, "name", "updatedAt", "version")).toEqual(true);
      created = res;
      console.log("Result: ", res);
    });

    it("should delete model", async () => {
      const res = new TestNestedModel(
        JSON.parse(await contract.delete(ctx as any, created.id.toString()))
      );
      expect(res.equals(created)).toEqual(true);
      console.log("Result: ", res);
      await expect(
        contract.read(ctx as any, created.id.toString())
      ).rejects.toThrow(NotFoundError);
    });

    let bulk: TestNestedModel[];

    it("should create in bulk", async () => {
      const models = Object.keys(new Array(10).fill(0)).map(
        (i) =>
          new TestNestedModel({
            name: "john" + i,
            nif: "123456789",
            children: [{ name: "any" + i }],
          })
      );

      const res = await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((m) => m.serialize()))
      );

      bulk = JSON.parse(res).map((m) => new TestNestedModel(JSON.parse(m)));
      expect(bulk).toBeDefined();
      expect(bulk.length).toEqual(models.length);
    });

    it("should read in bulk", async () => {
      const keys = (bulk || ["1"]).map((b) => b.id);

      const read = JSON.parse(
        await contract.readAll(ctx as any, JSON.stringify(keys))
      ).map((m) => new TestNestedModel(JSON.parse(m)));
      expect(read).toBeDefined();
      expect(read.length).toEqual(bulk.length);
    });

    it("should update in bulk", async () => {
      const models = bulk.map(
        (b) =>
          new TestNestedModel(
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
      ).map((m) => new TestNestedModel(JSON.parse(m)));
      expect(bulk).toBeDefined();
      expect(bulk.length).toEqual(models.length);
    });

    it("should delete in bulk", async () => {
      const keys = bulk.map((b) => b.id);

      const read = JSON.parse(
        await contract.deleteAll(ctx as any, JSON.stringify(keys))
      ).map((m) => new TestNestedModel(JSON.parse(m)));
      expect(read).toBeDefined();
      expect(read.length).toEqual(bulk.length);
    });
  });
});
