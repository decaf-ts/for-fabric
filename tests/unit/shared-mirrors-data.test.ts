import { getMockCtx } from "./ContextMock";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";

describe.skip("Tests Shared and mirrored models", () => {
  const ctx = getMockCtx();
  const contract = new OtherProductSharedContract();

  let created: OtherProductShared;

  it("should create and mirror", async () => {
    const id = generateGtin();
    const model = new OtherProductShared({
      productCode: id,
      inventedName: "test_name",
      nameMedicinalProduct: "123456789",
    });

    created = Model.deserialize(
      await contract.create(ctx as any, model.serialize())
    );

    console.log("Result: ", created);
  });

  it("should read model", async () => {
    const res = Model.deserialize(
      await contract.read(ctx as any, created.productCode.toString())
    );
    expect(res.equals(created)).toEqual(true);
    console.log("Result: ", res);
  });

  it("should update model", async () => {
    const res = Model.deserialize(
      await contract.update(
        ctx as any,
        new OtherProductShared({ ...created, name: "Jane Doe" }).serialize()
      )
    );
    expect(res.equals(created)).toEqual(false);
    expect(res.equals(created, "name", "updatedAt", "version")).toEqual(true);
    created = res;
    console.log("Result: ", res);
  });

  it("should delete model", async () => {
    const res = Model.deserialize(
      await contract.delete(ctx as any, created.productCode.toString())
    );
    expect(res.equals(created)).toEqual(true);
    console.log("Result: ", res);
    await expect(
      contract.read(ctx as any, created.productCode.toString())
    ).rejects.toThrow(NotFoundError);
  });

  let bulk: OtherProductShared[];

  it("should create in bulk", async () => {
    const models = Object.keys(new Array(10).fill(0)).map((i) => {
      const id = generateGtin();
      return new OtherProductShared({
        productCode: id,
        inventedName: "test_name" + i,
        nameMedicinalProduct: "123456789",
      });
    });

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
    const keys = bulk.map((b) => b.productCode);

    const read = JSON.parse(
      await contract.readAll(ctx as any, JSON.stringify(keys))
    ).map((m) => Model.deserialize(m));
    expect(read).toBeDefined();
    expect(read.length).toEqual(bulk.length);
  });

  it("should update in bulk", async () => {
    const models = bulk.map(
      (b) =>
        new OtherProductShared(
          Object.assign({}, b, {
            name: "updated" + b.productCode,
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
    const models = Object.keys(new Array(10).fill(0)).map((i) => {
      const id = generateGtin();
      return new OtherProductShared({
        productCode: id,
        inventedName: i.toString() + "test_name",
        nameMedicinalProduct: "123456789",
      });
    });

    bulk = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((m) => m.serialize()))
      )
    ).map((m) => Model.deserialize(m));
    const keys = bulk.map((b) => b.productCode);

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

  it("should paginate properly for simple queries", async () => {
    const page = await contract.paginateBy(
      ctx,
      "productCode",
      "desc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    expect(page).toBeDefined();
  });

  it("should executed prepared statements properly for simple queries", async () => {
    const page = await contract.statement(
      ctx,
      "paginateBy",
      JSON.stringify(["productCode", "desc", { offset: 1, limit: 3 }])
    );
    expect(page).toBeDefined();
  });
});
