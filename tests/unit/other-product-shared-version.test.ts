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
import { Paginator } from "@decaf-ts/core";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { GtinOwner } from "../../src/contract/models/GtinOwner";

jest.setTimeout(50000);

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

  async function loadSharedProduct(productCode: string) {
    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    return new OtherProductShared(JSON.parse(sharedState));
  }

  async function loadPublicOwner(productCode: string) {
    const k = stub.createCompositeKey("owner", [productCode]);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
    const publicState = await stub.getState(k);
    return new GtinOwner(JSON.parse(publicState.toString()));
  }

  async function expectMarketInSharedCollection(marketKey: string) {
    const mk = stub.createCompositeKey("market", [marketKey]);
    await expect(stub.getState(mk)).rejects.toThrow(NotFoundError);
    const state = await stub.getPrivateData("decaf-namespaceAeon", mk);
    expect(new OtherMarket(JSON.parse(state)).hasErrors()).toBeUndefined();
  }

  async function expectStrengthInSharedCollection(strengthKey: string) {
    const sk = stub.createCompositeKey("product_strength", [strengthKey]);
    await expect(stub.getState(sk)).rejects.toThrow(NotFoundError);
    const state = await stub.getPrivateData("decaf-namespaceAeon", sk);
    expect(
      new OtherProductStrength(JSON.parse(state)).hasErrors()
    ).toBeUndefined();
  }

  async function assertSharedRelations(product: OtherProductShared) {
    const marketIds = (product.markets || []).map((m) =>
      typeof m === "object" ? (m as OtherMarket).id : m
    );
    for (const marketId of marketIds) {
      await expectMarketInSharedCollection(marketId as string);
    }

    const strengthIds = (product.strengths || []).map((s) =>
      typeof s === "object" ? (s as OtherProductStrength).id : s
    );
    for (const strengthId of strengthIds) {
      await expectStrengthInSharedCollection(strengthId as string);
    }
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
    });

    const payload = preparePayload(baseModel);
    created = Model.deserialize(
      await contract.create(ctx as any, payload.serialize())
    ) as OtherProductShared;
    stub.commit();

    expect(created.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

    const product = await loadSharedProduct(productCode);
    expect(product.hasErrors()).toBeUndefined();
    await assertSharedRelations(product);

    const owner = await loadPublicOwner(productCode);
    expect(owner.hasErrors()).toBeUndefined();
  });

  it("reads the shared data", async () => {
    const read = Model.deserialize(
      await contract.read(ctx as any, productCode)
    ) as OtherProductShared;
    expect(read.hasErrors()).toBeUndefined();
    created = read;
  });

  it("update with shared data", async () => {
    const baseModel = new OtherProductShared({
      ...created,
      strengths: [buildStrength(productCode, "100mg")],
      markets: [buildMarket(productCode, "us")],
    });

    const payload = preparePayload(baseModel);
    created = Model.deserialize(
      await contract.update(ctx as any, payload.serialize())
    ) as OtherProductShared;
    stub.commit();

    expect(created.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

    const product = await loadSharedProduct(productCode);
    expect(product.hasErrors()).toBeUndefined();
    await assertSharedRelations(product);

    const owner = await loadPublicOwner(productCode);
    expect(owner.hasErrors()).toBeUndefined();
  });

  it("reads the shared data again", async () => {
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

    updated = await loadSharedProduct(productCode);
    expect(updated.hasErrors()).toBeUndefined();
    await assertSharedRelations(updated);

    expect(updated.version).toBe(3);
    expect(updated.strengths).toHaveLength(2);
    expect(updated.markets).toHaveLength(2);

    const result = await contract.read(ctx as any, created.productCode);

    const read = Model.deserialize(result) as OtherProductShared;

    expect(read.hasErrors()).toBeUndefined();
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

    await expect(loadPublicOwner(productCode)).rejects.toThrow(NotFoundError);
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
        const newObj = await loadSharedProduct(productCode);
        expect(newObj.hasErrors()).toBeUndefined();
        await assertSharedRelations(newObj);

        const owner = await loadPublicOwner(productCode);
        expect(owner.hasErrors()).toBeUndefined();

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
        const product = await loadSharedProduct(productCode);
        expect(product.hasErrors()).toBeUndefined();
        await assertSharedRelations(product);
      }

      bulk = read;
    });

    it("Updates in Bulk", async () => {
      const toUpdate = bulk.map((c, i) => {
        return new OtherProductShared({
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
      const newBulk: OtherProductShared[] = [];
      for (const b of toUpdate) {
        expect(b.hasErrors()).toBeDefined();
        const productCode = toUpdate[count++].productCode;
        const newObj = await loadSharedProduct(productCode);
        expect(newObj.hasErrors()).toBeUndefined();
        await assertSharedRelations(newObj);
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
      const pk = Model.pk(OtherProductShared);
      const ids = bulk.map((c) => c[pk]) as number[];

      const deleted: OtherProductShared[] = JSON.parse(
        await contract.deleteAll(ctx as any, JSON.stringify(ids))
      ).map((r: any) => Model.deserialize(r));

      stub.commit();

      let count = 0;
      for (const b of deleted) {
        expect(b.hasErrors()).toBeDefined();
        const productCode = deleted[count++].productCode;
        const k = stub.createCompositeKey("other_product_shared", [
          productCode,
        ]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);

        await expect(loadPublicOwner(productCode)).rejects.toThrow(
          NotFoundError
        );
      }
    });
  });
});
