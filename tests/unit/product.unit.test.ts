import { ProductContract } from "../../src/contract/ProductContract";
import { getMockCtx } from "./ContextMock";
import { Model } from "@decaf-ts/decorator-validation";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { generateGtin } from "../../src/contract/models/gtin";
import { Product } from "../../src/contract/models/Product";

describe("Tests product contract", () => {
  const ctx = getMockCtx();
  const stub = ctx.stub as ReturnType<typeof import("./ContextMock").getStubMock>;
  const contract = new ProductContract();

  let created: Product;

  it("should create model", async () => {
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

    created = Model.deserialize(
      await contract.create(ctx as any, model.serialize())
    );
    stub.commit();

    expect(created.strengths).toBeDefined();
    expect(created.strengths.length).toEqual(2);
    expect(created.markets).toBeDefined();
    expect(created.markets.length).toEqual(2);

    // fails to create a second

    await expect(contract.create(ctx, model.serialize())).rejects.toThrow(
      ConflictError
    );
    stub.commit();

    console.log("Result: ", created);
  });

  it("should read model", async () => {
    const res = Model.deserialize(
      await contract.read(ctx as any, created.productCode.toString())
    );
    stub.commit();
    expect(res.equals(created)).toEqual(true);
    console.log("Result: ", res);
  });

  it("should update model", async () => {
    const res = Model.deserialize(
      await contract.update(
        ctx as any,
        new Product({ ...created, inventedName: "Jane Doe" }).serialize()
      )
    );
    stub.commit();
    expect(res.equals(created)).toEqual(false);
    expect(res.equals(created, "inventedName", "updatedAt", "version")).toEqual(
      true
    );
    created = res;
    console.log("Result: ", res);
  });

  it("should delete model", async () => {
    const res = Model.deserialize(
      await contract.delete(ctx as any, created.productCode.toString())
    );
    stub.commit();
    expect(res.equals(created)).toEqual(true);
    console.log("Result: ", res);
    await expect(
      contract.read(ctx as any, created.productCode.toString())
    ).rejects.toThrow(NotFoundError);
    stub.commit();
  });

  let bulk: Product[];

  it("should create in bulk", async () => {
    const models = Object.keys(new Array(10).fill(0)).map(() => {
      const id = generateGtin();
      return new Product({
        productCode: id,
        inventedName: "test_name",
        nameMedicinalProduct: "123456789",
      });
    });

    bulk = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((m) => m.serialize()))
      )
    ).map((m) => Model.deserialize(m));
    stub.commit();
    expect(bulk).toBeDefined();
    expect(bulk.length).toEqual(models.length);
  });

  it("should read in bulk", async () => {
    const keys = bulk.map((b) => b.productCode);

    const read = JSON.parse(
      await contract.readAll(ctx as any, JSON.stringify(keys))
    ).map((m) => Model.deserialize(m));
    stub.commit();
    expect(read).toBeDefined();
    expect(read.length).toEqual(bulk.length);
  });

  it("should update in bulk", async () => {
    const models = bulk.map(
      (b) =>
        new Product(
          Object.assign({}, b, {
            inventedName: "updated" + b.productCode,
          })
        )
    );

    bulk = JSON.parse(
      await contract.updateAll(
        ctx as any,
        JSON.stringify(models.map((m) => m.serialize()))
      )
    ).map((m) => Model.deserialize(m));
    stub.commit();
    expect(bulk).toBeDefined();
    expect(bulk.length).toEqual(models.length);
  });

  it("should delete in bulk", async () => {
    const models = Object.keys(new Array(10).fill(0)).map(() => {
      const id = generateGtin();
      return new Product({
        productCode: id,
        inventedName: "test_name",
        nameMedicinalProduct: "123456789",
      });
    });

    bulk = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((m) => m.serialize()))
      )
    ).map((m) => Model.deserialize(m));
    stub.commit();
    const keys = bulk.map((b) => b.productCode);

    const read = JSON.parse(
      await contract.deleteAll(ctx as any, JSON.stringify(keys))
    ).map((m) => Model.deserialize(m));
    stub.commit();
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
    stub.commit();
    expect(bulk).toBeDefined();
  });

  it("should paginate properly for simple queries", async () => {
    const page = await contract.paginateBy(
      ctx,
      "productCode",
      "desc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    stub.commit();
    expect(page).toBeDefined();
  });

  it("should executed prepared statements properly for simple queries", async () => {
    const page = await contract.statement(
      ctx,
      "paginateBy",
      JSON.stringify(["productCode", "desc", { offset: 1, limit: 3 }])
    );
    stub.commit();
    expect(page).toBeDefined();
  });
});
