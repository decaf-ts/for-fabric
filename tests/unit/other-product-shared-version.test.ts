import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { ProductStrength } from "../../src/contract/models/ProductStrength";
import { Market } from "../../src/contract/models/Market";
import { generateGtin } from "../../src/contract/models/gtin";
import { Product } from "../../src/contract/models/Product";
import { OrderDirection, PersistenceKeys, Repository } from "@decaf-ts/core";
import { FabricClientRepository } from "../../src/index";

describe("OtherProductShared contract version flow with relations", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new OtherProductSharedContract();
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

  function preparePayload(model: OtherProductShared) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};

    transientSpy.mockImplementation(() => transient);
    return segregated.model;
  }

  function preparePayloadBulk(model: OtherProductShared[]) {
    const segregated = model.map((m) => Model.segregate(m));
    const transient = segregated.map((s) => s.transient || {});

    transientSpy.mockImplementation(() => transient);
    return segregated.map((s) => s.model.serialize());
  }

  let productCode: string = "";
  let created: OtherProductShared;

  it.skip("holds the correct metadata", () => {
    const instance = new OtherProductShared();
    const properties = Metadata.properties(OtherProductShared);
    const validatableProperties =
      Metadata.validatableProperties(OtherProductShared);
    const keys = Object.keys(instance);
    expect(properties.length).toEqual(keys.length); // own-class properties only
    expect(validatableProperties.length).toEqual(keys.length);
  });

  it("creates with shared data", async () => {
    productCode = generateGtin();
    const baseModel = new OtherProductShared({
      productCode,
      inventedName: "initial-name",
      nameMedicinalProduct: "medicinal",
      strengths: [buildStrength(productCode, "100mg")],
      markets: [buildMarket(productCode, "us")],
    });

    const payload = preparePayload(baseModel);
    created = Model.deserialize(
      await contract.create(ctx as any, payload.serialize())
    ) as OtherProductShared;
    stub.commit();

    expect(created.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    expect(
      new OtherProductShared(JSON.parse(sharedState)).hasErrors()
    ).toBeUndefined();
  });

  it("reads the shared data", async () => {
    const read = Model.deserialize(
      await contract.read(ctx as any, productCode)
    ) as OtherProductShared;
    expect(read.hasErrors()).toBeUndefined();
    created = read;
  });

  let updated: OtherProductShared;

  it("updates the shared data", async () => {
    const updatedModel = new OtherProductShared({
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
    ) as OtherProductShared;
    stub.commit();

    expect(updated.hasErrors()).toBeDefined();

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    updated = new OtherProductShared(JSON.parse(sharedState));
    expect(updated.hasErrors()).toBeUndefined();

    expect(updated.version).toBe(2);
    expect(updated.strengths).toHaveLength(2);
    expect(updated.markets).toHaveLength(2);

    const read = Model.deserialize(
      await contract.read(ctx as any, created.productCode)
    ) as OtherProductShared;

    expect(read.equals(updated)).toBe(true);
  });

  it("deletes the shared data", async () => {
    const deleted = Model.deserialize(
      await contract.delete(ctx as any, created.productCode)
    ) as OtherProductShared;

    stub.commit();
    expect(deleted.hasErrors()).toBeUndefined();

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
  });

  describe("Bulk Crud", () => {
    let bulk: OtherProductShared[];

    it("Creates in bulk", async () => {
      const models = new Array(10).fill(0).map(() => {
        const id = generateGtin();
        return new OtherProductShared({
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
      const newBulk: OtherProductShared[] = [];
      for (const b of bulk) {
        expect(b.hasErrors()).toBeDefined();
        const productCode = models[count++].productCode;
        const k = stub.createCompositeKey("other_product_shared", [
          productCode,
        ]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
        const newObj = new OtherProductShared(JSON.parse(sharedState));
        expect(newObj.hasErrors()).toBeUndefined();
        newBulk.push(newObj);
      }

      bulk = newBulk;
    });

    it("Reads in Bulk", async () => {
      const pk = Model.pk(OtherProductShared);
      const ids = bulk.map((c) => c[pk]) as number[];

      const read: OtherProductShared[] = JSON.parse(
        await contract.readAll(ctx as any, JSON.stringify(ids))
      ).map((r: any) => Model.deserialize(r));

      let count = 0;
      for (const b of read) {
        expect(b.hasErrors()).toBeUndefined();
        const productCode = read[count++].productCode;
        const k = stub.createCompositeKey("other_product_shared", [
          productCode,
        ]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        await stub.getPrivateData("decaf-namespaceAeon", k);
      }

      bulk = read;
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
      const models = new Array(10).fill(0).map(() => {
        const id = generateGtin();
        return new OtherProductShared({
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

      const payload = JSON.stringify(preparePayloadBulk(toUpdate));

      bulk = JSON.parse(await contract.updateAll(ctx as any, payload)).map(
        (r: any) => Model.deserialize(r)
      );
      stub.commit();

      let count = 0;
      const newBulk: OtherProductShared[] = [];
      for (const b of bulk) {
        expect(b.hasErrors()).toBeDefined();
        const productCode = models[count++].productCode;
        const k = stub.createCompositeKey("other_product_shared", [
          productCode,
        ]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
        const newObj = new OtherProductShared(JSON.parse(sharedState));
        expect(newObj.hasErrors()).toBeUndefined();
        newBulk.push(newObj);
      }

      bulk = newBulk;
    });

    it.skip("lists", async () => {
      const repo: FabricClientRepository<Product> = Repository.forModel<
        Product,
        FabricClientRepository<Product>
      >(Product);

      const list = await repo.listBy("inventedName", OrderDirection.ASC);
      expect(list).toBeDefined();
      // expect(list.every((el) => el instanceof Product)).toEqual(true);
    });

    it.skip("Paginates", async () => {
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

    it.skip("Deletes in Bulk", async () => {
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
