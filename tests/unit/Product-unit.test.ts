import { FabricContractAdapter, FabricCrudContract } from "../../src/contracts";
console.log("Using adapter:", FabricContractAdapter.name);
import { getMockCtx, getStubMock } from "./ContextMock";
import { generateGtin } from "../../src/contract/models/gtin";
import { Logging, LogLevel } from "@decaf-ts/logging";
import { ProductContract } from "../../src/contract/ProductContract";
import { Product } from "../../src/contract/models/Product";
import { Model } from "@decaf-ts/decorator-validation";
import { Market } from "../../src/contract/models/Market";
import { ProductStrength } from "../../src/contract/models/ProductStrength";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Paginator } from "@decaf-ts/core";
Logging.setConfig({ level: LogLevel.debug });

jest.setTimeout(30000);
describe("Tests Product Contract", () => {
  let contract = new ProductContract();
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new ProductContract();
  });

  beforeEach(() => {
    ctx = getMockCtx();
    Object.assign(ctx, { stub: stub });

    transientSpy = jest.spyOn(
      contract as any,
      "getTransientData" as any
    ) as jest.SpyInstance;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildMarket(productCode: string, suffix: string) {
    return new Market({
      productCode,
      marketId: `market-${suffix}`,
    });
  }

  function buildStrength(productCode: string, strength: string) {
    return new ProductStrength({
      productCode,
      strength,
    });
  }

  function preparePayload(model: Product) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};

    transientSpy.mockImplementation(() => transient);
    return segregated.model;
  }

  function preparePayloadBulk(model: Product[]) {
    const segregated = model.map((m) => Model.segregate(m));
    const transient = segregated.map((s) => s.transient || {});

    transientSpy.mockImplementation(() => transient);
    return segregated.map((s) => s.model.serialize());
  }

  let productCode: string = "";
  let created: Product;

  it("creates with public data", async () => {
    productCode = generateGtin();
    const baseModel = new Product({
      productCode,
      inventedName: "initial-name",
      nameMedicinalProduct: "medicinal",
      strengths: [buildStrength(productCode, "100mg")],
      markets: [buildMarket(productCode, "us")],
    });

    const payload = preparePayload(baseModel);
    created = Model.deserialize(
      await contract.create(ctx as any, payload.serialize())
    ) as Product;
    stub.commit();

    expect(created.hasErrors()).toBeUndefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

    const k = stub.createCompositeKey("product", [productCode]);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
    expect(
      new Product(JSON.parse((await stub.getState(k)).toString())).hasErrors()
    ).toBeUndefined();
  });

  it("reads the public data", async () => {
    const read = Model.deserialize(
      await contract.read(ctx as any, productCode)
    ) as Product;
    console.log("READ RESULT", read, read?.hasErrors());
    expect(read.hasErrors()).toBeUndefined();
    expect(read.equals(created)).toBe(true);
    created = read;
  });

  let updated: Product;

  it("updates the public data", async () => {
    const updatedModel = new Product({
      ...created,
      inventedName: "updated-name",
      strengths: [
        ...(created.strengths || []),
        buildStrength(created.productCode, "200mg"),
      ],
      markets: [
        ...(created.markets || []),
        buildMarket(created.productCode, "eu"),
      ],
    });

    const updatePayload = preparePayload(updatedModel);
    updated = Model.deserialize(
      await contract.update(ctx as any, updatePayload.serialize())
    ) as Product;
    stub.commit();

    expect(updated.hasErrors()).toBeUndefined();

    const k = stub.createCompositeKey("product", [productCode]);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
    const publicState = await stub.getState(k);
    updated = new Product(JSON.parse(publicState.toString()));
    expect(updated.hasErrors()).toBeUndefined();

    expect(updated.version).toBe(2);
    expect(updated.strengths).toHaveLength(2);
    expect(updated.markets).toHaveLength(2);

    const read = Model.deserialize(
      await contract.read(ctx as any, created.productCode)
    ) as Product;

    expect(read.equals(updated)).toBe(true);
  });

  it("deletes the public data", async () => {
    const deleted = Model.deserialize(
      await contract.delete(ctx as any, created.productCode)
    ) as Product;

    stub.commit();
    expect(deleted.hasErrors()).toBeUndefined();

    const k = stub.createCompositeKey("product", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
  });

  describe("Bulk Crud", () => {
    let bulk: Product[];

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

      const payload = JSON.stringify(preparePayloadBulk(models));

      bulk = JSON.parse(await contract.createAll(ctx as any, payload)).map(
        (r: any) => Model.deserialize(r)
      );
      stub.commit();

      let count = 0;
      const newBulk: Product[] = [];
      for (const b of bulk) {
        expect(b.hasErrors()).toBeUndefined();
        const productCode = models[count++].productCode;
        const k = stub.createCompositeKey("product", [productCode]);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);
        const publicState = await stub.getState(k);
        const newObj = new Product(JSON.parse(publicState.toString()));
        expect(newObj.hasErrors()).toBeUndefined();
        newBulk.push(newObj);
      }

      bulk = newBulk;
    });

    it("Reads in Bulk", async () => {
      const pk = Model.pk(Product);
      const ids = bulk.map((c) => c[pk]) as number[];

      const read: Product[] = JSON.parse(
        await contract.readAll(ctx as any, JSON.stringify(ids))
      ).map((r: any) => Model.deserialize(r));

      let count = 0;
      for (const b of read) {
        expect(b.hasErrors()).toBeUndefined();
        const productCode = read[count++].productCode;
        const k = stub.createCompositeKey("product", [productCode]);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);
        await stub.getState(k);
      }

      bulk = read;
    });

    it("Updates in Bulk", async () => {
      const toUpdate = bulk.map((c, i) => {
        return new Product({
          productCode: c.productCode,
          inventedName: "inventedName_" + i,
        });
      });

      const payload = JSON.stringify(preparePayloadBulk(toUpdate));

      bulk = JSON.parse(await contract.updateAll(ctx as any, payload)).map(
        (r: any) => Model.deserialize(r)
      );
      stub.commit();

      let count = 0;
      const newBulk: Product[] = [];
      for (const b of toUpdate) {
        expect(b.hasErrors()).toBeUndefined();
        const productCode = toUpdate[count++].productCode;
        const k = stub.createCompositeKey("product", [productCode]);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);
        const publicState = await stub.getState(k);
        const newObj = new Product(JSON.parse(publicState.toString()));
        expect(newObj.hasErrors()).toBeUndefined();
        newBulk.push(newObj);
      }

      bulk = newBulk;
    });

    it("lists via statement", async () => {
      const listed = JSON.parse(
        await contract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["inventedName", "asc"])
        )
      );
      expect(listed).toBeDefined();
      expect(listed.length).toEqual(bulk.length);
      // expect(listed.every((el) => el instanceof Product)).toEqual(true);
      // expect(listed.every((el, i) => el.equals(bulk[i])).toEqual(true);
    });

    it("paginates via paginateBy", async () => {
      const page = await contract.paginateBy(
        ctx,
        "inventedName",
        "desc",
        JSON.stringify({ offset: 1, limit: 3 })
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
    });

    it("paginates via statement", async () => {
      const page = await contract.statement(
        ctx,
        "paginateBy",
        JSON.stringify(["inventedName", "desc", { offset: 1, limit: 3 }])
      );
      expect(page).toBeDefined();
    });

    it("Deletes in Bulk", async () => {
      const pk = Model.pk(Product);
      const ids = bulk.map((c) => c[pk]) as number[];

      const deleted: Product[] = JSON.parse(
        await contract.deleteAll(ctx as any, JSON.stringify(ids))
      ).map((r: any) => Model.deserialize(r));

      stub.commit();

      let count = 0;
      for (const b of deleted) {
        expect(b.hasErrors()).toBeUndefined();
        const productCode = deleted[count++].productCode;
        const k = stub.createCompositeKey("product", [productCode]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);
      }
    });
  });
});
