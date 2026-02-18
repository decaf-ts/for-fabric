import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";
import { Paginator } from "@decaf-ts/core";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { GtinOwner } from "../../src/contract/models/GtinOwner";
import { FabricClientPaginator } from "../../src/client/FabricClientPaginator";
import { OtherBatchShared } from "../../src/contract/models/OtherBatchShared";
import { OtherBatchContract } from "../../src/contract/OtherBatchContract";

jest.setTimeout(50000);

describe("OtherProductShared contract version flow with relations", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let batchContract: OtherBatchContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new OtherProductSharedContract();
    batchContract = new OtherBatchContract();
  });

  function buildMarket(productCode: string, suffix: string) {
    return new OtherMarket({
      productCode,
      marketId: `market-${suffix}`,
    });
  }

  function buildStrength(productCode: string, strength: string) {
    return new OtherProductStrength({
      productCode,
      strength,
    });
  }

  function preparePayload(model: OtherProductShared | OtherBatchShared) {
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

  async function loadSharedBatch(productCode: string, batch: string) {
    const k = stub.createCompositeKey("other_batch_shared", [
      `${productCode}:${batch}`,
    ]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    return new OtherBatchShared(JSON.parse(sharedState));
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

  function preparePayloadBulk(
    model: (OtherProductShared | OtherBatchShared)[]
  ) {
    const segregated = model.map((m) => Model.segregate(m));
    const transient = segregated.map((s) => s.transient || {});

    transientSpy.mockImplementation(() => transient);
    return segregated.map((s) => s.model.serialize());
  }

  let productCode: string = "";
  let created: OtherProductShared;
  let bulk: OtherProductShared[];

  describe("product single crud", () => {
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

    it("holds the correct metadata", () => {
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
      expect(read.productCode).toBe(updated.productCode);
      expect(read.inventedName).toBe(updated.inventedName);
      expect(read.version).toBe(updated.version);
    });

    it("deletes the shared data", async () => {
      const deleted = Model.deserialize(
        await contract.delete(ctx as any, created.productCode)
      ) as OtherProductShared;

      stub.commit();
      expect(deleted.hasErrors()).toBeUndefined();

      const k = stub.createCompositeKey("other_product_shared", [productCode]);
      await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
      await expect(
        stub.getPrivateData("decaf-namespaceAeon", k)
      ).rejects.toThrow(NotFoundError);

      await expect(loadPublicOwner(productCode)).rejects.toThrow(NotFoundError);
    });
  });

  describe("product Bulk Crud & query", () => {
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
      // expect(listed.every((el) => el instanceof OtherProductShared)).toEqual(
      //   true
      // );
      // expect(listed.every((el, i) => el.equals(bulk[i]))).toEqual(true);
    });

    it("paginates via paginateBy", async () => {
      const tableName = Model.tableName(OtherProductShared);
      // Sort bulk by productCode descending to know expected order
      const sorted = [...bulk].sort((a, b) =>
        b.productCode.localeCompare(a.productCode)
      );
      const expectedPage1 = sorted.slice(0, 3);
      const expectedPage2 = sorted.slice(3, 6);

      // --- Page 1 ---
      let page = await contract.paginateBy(
        ctx,
        "productCode",
        "desc",
        JSON.stringify({ offset: 1, limit: 3 })
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toEqual(3);
      expect(parsedPage.current).toEqual(1);
      expect(parsedPage.count).toEqual(10);
      expect(parsedPage.total).toEqual(4);

      // Validate actual records match expected order
      const page1Data = parsedPage.data as OtherProductShared[];
      for (let i = 0; i < 3; i++) {
        expect(page1Data[i].productCode).toEqual(expectedPage1[i].productCode);
      }

      // Bookmark should be the _id of the last record on this page
      const expectedBookmark1 = `${tableName}_${expectedPage1[2].productCode}`;
      expect(parsedPage.bookmark).toEqual(expectedBookmark1);

      const paginator = new FabricClientPaginator(
        null as any,
        null as any,
        3,
        OtherProductShared
      );
      paginator.apply(parsedPage as any);

      expect(paginator.current).toEqual(1);
      expect(paginator.count).toEqual(10);
      expect(paginator.total).toEqual(4);

      // --- Page 2 ---
      page = await contract.paginateBy(
        ctx,
        "productCode",
        "desc",
        JSON.stringify({ offset: 2, limit: 3, bookmark: parsedPage.bookmark })
      );
      expect(page).toBeDefined();

      const secondParsedPage = Paginator.deserialize(page);
      expect(secondParsedPage.data.length).toEqual(3);
      expect(secondParsedPage.current).toEqual(2);

      // Validate actual records match expected order
      const page2Data = secondParsedPage.data as OtherProductShared[];
      for (let i = 0; i < 3; i++) {
        expect(page2Data[i].productCode).toEqual(expectedPage2[i].productCode);
      }

      // Bookmark should be the _id of the last record on this page
      const expectedBookmark2 = `${tableName}_${expectedPage2[2].productCode}`;
      expect(secondParsedPage.bookmark).toEqual(expectedBookmark2);
      expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);

      paginator.apply(secondParsedPage as any);

      expect(paginator.current).toEqual(2);
      expect(paginator.count).toEqual(10);
      expect(paginator.total).toEqual(4);
    });

    it("paginates via statement", async () => {
      let page = await contract.statement(
        ctx,
        "paginateBy",
        JSON.stringify(["inventedName", "desc", { offset: 1, limit: 3 }])
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toEqual(3);
      expect(parsedPage.current).toEqual(1);
      expect(parsedPage.bookmark).toBeTruthy();

      page = await contract.statement(
        ctx,
        "paginateBy",
        JSON.stringify([
          "inventedName",
          "desc",
          { offset: 2, limit: 3, bookmark: parsedPage.bookmark },
        ])
      );
      expect(page).toBeDefined();

      const secondParsedPage = Paginator.deserialize(page);
      // expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
      expect(secondParsedPage.data.length).toEqual(3);
      expect(secondParsedPage.current).toEqual(2);
      expect(secondParsedPage.bookmark).toBeTruthy();
      expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);
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

  describe("batch single crud", () => {
    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub: stub });

      transientSpy = jest.spyOn(
        batchContract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    let created: OtherBatchShared;

    it("holds the correct metadata", () => {
      const instance = new OtherBatchShared();
      const properties = Metadata.properties(OtherBatchShared);
      const validatableProperties =
        Metadata.validatableProperties(OtherBatchShared);
      const keys = Object.keys(instance);
      expect(properties.length).toEqual(keys.length); // own-class properties only
      expect(validatableProperties.length).toEqual(keys.length);
    });

    it("creates with shared data", async () => {
      const baseModel = new OtherBatchShared({
        productCode,
        batchNumber: "test-batch",
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const payload = preparePayload(baseModel);
      created = Model.deserialize(
        await batchContract.create(ctx as any, payload.serialize())
      ) as OtherBatchShared;
      stub.commit();

      expect(created.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

      const batch = await loadSharedBatch(productCode, baseModel.batchNumber);
      expect(batch.hasErrors()).toBeUndefined();
      created = batch;
    });

    it("reads the shared data", async () => {
      const read = Model.deserialize(
        await batchContract.read(ctx as any, created.id)
      ) as OtherBatchShared;
      expect(read.hasErrors()).toBeUndefined();
      created = read;
    });

    let updated: OtherBatchShared;

    it("update with shared data", async () => {
      const baseModel = new OtherBatchShared({
        ...created,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const payload = preparePayload(baseModel);
      updated = Model.deserialize(
        await batchContract.update(ctx as any, payload.serialize())
      ) as OtherBatchShared;
      stub.commit();

      expect(updated.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

      const batch = await loadSharedBatch(productCode, created.batchNumber);
      expect(batch.hasErrors()).toBeUndefined();
      updated = batch;
    });

    it("reads the shared data again", async () => {
      const read = Model.deserialize(
        await batchContract.read(ctx as any, created.id)
      ) as OtherBatchShared;
      expect(read.hasErrors()).toBeUndefined();
      created = read;
    });

    it("deletes the shared data", async () => {
      const deleted = Model.deserialize(
        await batchContract.delete(ctx as any, created.id)
      ) as OtherBatchShared;

      stub.commit();
      expect(deleted.hasErrors()).toBeUndefined();

      const k = stub.createCompositeKey("other_product_shared", [
        `${productCode}:${updated.id}`,
      ]);
      await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
      await expect(
        stub.getPrivateData("decaf-namespaceAeon", k)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("batch Bulk Crud & query", () => {
    let batchBulk: OtherBatchShared[];

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub: stub });

      transientSpy = jest.spyOn(
        batchContract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("Creates in bulk", async () => {
      const models = new Array(10).fill(0).map((_, i) => {
        const pc = generateGtin();
        return new OtherBatchShared({
          productCode: pc,
          batchNumber: `BN${String(i).padStart(3, "0")}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
      });

      const payload = JSON.stringify(preparePayloadBulk(models));

      batchBulk = JSON.parse(
        await batchContract.createAll(ctx as any, payload)
      ).map((r: any) => Model.deserialize(r));
      stub.commit();

      const newBulk: OtherBatchShared[] = [];
      for (let i = 0; i < batchBulk.length; i++) {
        expect(batchBulk[i].hasErrors()).toBeDefined();
        const batch = await loadSharedBatch(
          models[i].productCode,
          models[i].batchNumber
        );
        expect(batch.hasErrors()).toBeUndefined();
        newBulk.push(batch);
      }

      batchBulk = newBulk;
    });

    it("updates in bulk", async () => {
      const toUpdate = batchBulk.map((b, i) => {
        return new OtherBatchShared({
          ...b,
          manufacturerName: `Manufacturer Name Update ${i}`,
        });
      });

      const payload = JSON.stringify(preparePayloadBulk(toUpdate));

      JSON.parse(await batchContract.updateAll(ctx as any, payload)).map(
        (r: any) => Model.deserialize(r)
      );
      stub.commit();

      const newBulk: OtherBatchShared[] = [];
      for (let i = 0; i < batchBulk.length; i++) {
        expect(batchBulk[i].hasErrors()).toBeUndefined();
        const batch = await loadSharedBatch(
          toUpdate[i].productCode,
          toUpdate[i].batchNumber
        );
        expect(batch.hasErrors()).toBeUndefined();
        newBulk.push(batch);
      }

      batchBulk = newBulk;
    });

    it("paginates via paginateBy", async () => {
      let page = await batchContract.paginateBy(
        ctx,
        "batchNumber",
        "asc",
        JSON.stringify({ offset: 1, limit: 3 })
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toEqual(3);
      expect(parsedPage.current).toEqual(1);
      expect(parsedPage.bookmark).toBeTruthy();

      const paginator = new FabricClientPaginator(
        null as any,
        null as any,
        3,
        OtherBatchShared
      );

      paginator.apply(parsedPage as any);

      expect(paginator.current).toEqual(1);
      expect(paginator.count).toEqual(10);
      expect(paginator.total).toEqual(4);

      page = await batchContract.paginateBy(
        ctx,
        "batchNumber",
        "asc",
        JSON.stringify({ offset: 2, limit: 3, bookmark: parsedPage.bookmark })
      );
      expect(page).toBeDefined();

      const secondParsedPage = Paginator.deserialize(page);
      expect(secondParsedPage.data.length).toEqual(3);
      expect(secondParsedPage.current).toEqual(2);
      expect(secondParsedPage.bookmark).toBeTruthy();
      expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);

      paginator.apply(secondParsedPage as any);

      expect(paginator.current).toEqual(2);
      expect(paginator.count).toEqual(10);
      expect(paginator.total).toEqual(4);
    });

    it("paginates via statement", async () => {
      let page = await batchContract.statement(
        ctx,
        "paginateBy",
        JSON.stringify(["batchNumber", "asc", { offset: 1, limit: 3 }])
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toEqual(3);
      expect(parsedPage.current).toEqual(1);
      expect(parsedPage.bookmark).toBeTruthy();

      page = await batchContract.statement(
        ctx,
        "paginateBy",
        JSON.stringify([
          "batchNumber",
          "asc",
          { offset: 2, limit: 3, bookmark: parsedPage.bookmark },
        ])
      );
      expect(page).toBeDefined();

      const secondParsedPage = Paginator.deserialize(page);
      expect(secondParsedPage.data.length).toEqual(3);
      expect(secondParsedPage.current).toEqual(2);
      expect(secondParsedPage.bookmark).toBeTruthy();
      expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);
    });

    it("lists via statement", async () => {
      const listed = JSON.parse(
        await batchContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["batchNumber", "asc"])
        )
      );
      expect(listed).toBeDefined();
      expect(listed.length).toEqual(batchBulk.length);
    });
  });
});
