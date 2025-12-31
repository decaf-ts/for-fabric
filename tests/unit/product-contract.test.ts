import { TestPublicModelContract } from "../assets/contract/serialized-contract-public-model/TestPublicModelContract";
import { TestPublicModel } from "../assets/contract/serialized-contract-public-model/TestPublicModel";
import { getMockCtx } from "./ContextMock";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";

describe("Product Contract test", () => {
  const ctx = getMockCtx();
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

    created = Model.deserialize(
      await contract.create(ctx as any, model.serialize())
    );

    console.log("Result: ", created);
  });

  it("should read model", async () => {
    const res = Model.deserialize(
      await contract.read(ctx as any, created.id.toString())
    );
    expect(res.equals(created)).toEqual(true);
    console.log("Result: ", res);
  });

  it("should update model", async () => {
    const res = Model.deserialize(
      await contract.update(
        ctx as any,
        new TestPublicModel({ ...created, name: "Jane Doe" }).serialize()
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

  it("should perform simple queries", async () => {
    const bulk = JSON.parse(
      await contract.statement(
        ctx as any,
        "listBy",
        JSON.stringify(["productCode", "asc"])
      )
    );
    expect(bulk).toBeDefined();
  });

  it("should perform simple queries", async () => {
    const bulk = JSON.parse(
      await contract.statement(
        ctx as any,
        "listBy",
        JSON.stringify(["productCode", "asc"])
      )
    );
    expect(bulk).toBeDefined();
  });

  it("should paginate properly for simple queries", async () => {});
});
