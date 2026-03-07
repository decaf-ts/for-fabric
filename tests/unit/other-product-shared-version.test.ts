import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";
import { AuthorizationError, Paginator } from "@decaf-ts/core";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { GtinOwner } from "../../src/contract/models/GtinOwner";
import { FabricClientPaginator } from "../../src/client/FabricClientPaginator";
import { OtherBatchShared } from "../../src/contract/models/OtherBatchShared";
import { OtherBatchContract } from "../../src/contract/OtherBatchContract";
import { AuditContract } from "../../src/contract/AuditContract";
import { OtherAudit } from "../../src/contract/models/OtherAudit";
import { OtherAuditContract } from "../../src/contract/OtherAuditContract";

jest.setTimeout(50000);

describe("OtherProductShared contract version flow with relations", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let batchContract: OtherBatchContract;
  let transientSpy: jest.SpyInstance;
  let auditContract: AuditContract;

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new OtherProductSharedContract();
    batchContract = new OtherBatchContract();
    auditContract = new OtherAuditContract();
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

  async function expectMarketNotInSharedCollection(marketKey: string) {
    const mk = stub.createCompositeKey("market", [marketKey]);
    await expect(stub.getState(mk)).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", mk)
    ).rejects.toThrow(NotFoundError);
    await expect(stub.getPrivateData("mirror-collection", mk)).rejects.toThrow(
      NotFoundError
    );
  }

  async function expectStrengthNotInSharedCollection(strengthKey: string) {
    const sk = stub.createCompositeKey("product_strength", [strengthKey]);
    await expect(stub.getState(sk)).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", sk)
    ).rejects.toThrow(NotFoundError);
    await expect(stub.getPrivateData("mirror-collection", sk)).rejects.toThrow(
      NotFoundError
    );
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

  async function assertNotSharedRelations(product: OtherProductShared) {
    const marketIds = (product.markets || []).map((m) =>
      typeof m === "object" ? (m as OtherMarket).id : m
    );
    for (const marketId of marketIds) {
      await expectMarketNotInSharedCollection(marketId as string);
    }

    const strengthIds = (product.strengths || []).map((s) =>
      typeof s === "object" ? (s as OtherProductStrength).id : s
    );
    for (const strengthId of strengthIds) {
      await expectStrengthNotInSharedCollection(strengthId as string);
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

  async function expectInMirrorCollection(tableName: string, id: string) {
    const k = stub.createCompositeKey(tableName, [id]);
    const data = await stub.getPrivateData("mirror-collection", k);
    const parsed = JSON.parse(Buffer.from(data).toString("utf8"));
    expect(parsed).toBeDefined();
    return parsed;
  }

  async function assertMirrorCopies(product: OtherProductShared) {
    const mirror = await expectInMirrorCollection(
      "other_product_shared",
      product.productCode
    );
    expect(mirror.productCode).toBe(product.productCode);
    expect(mirror.inventedName).toBe(product.inventedName);
    expect(mirror.nameMedicinalProduct).toBe(product.nameMedicinalProduct);

    const marketIds = (product.markets || []).map((m) =>
      typeof m === "object" ? (m as OtherMarket).id : m
    );
    for (const marketId of marketIds) {
      await expectInMirrorCollection("market", marketId as string);
    }

    const strengthIds = (product.strengths || []).map((s) =>
      typeof s === "object" ? (s as OtherProductStrength).id : s
    );
    for (const strengthId of strengthIds) {
      await expectInMirrorCollection("product_strength", strengthId as string);
    }
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

      created = await loadSharedProduct(productCode);
      expect(created.hasErrors()).toBeUndefined();
      await assertSharedRelations(created);
      await assertMirrorCopies(created);

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
      await assertMirrorCopies(product);

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

    it("non-mirror reads ignore mirror collection mutations", async () => {
      const key = stub.createCompositeKey("other_product_shared", [
        productCode,
      ]);
      const originalMirror = JSON.parse(
        Buffer.from(
          await stub.getPrivateData("mirror-collection", key)
        ).toString("utf8")
      );
      const mutated = {
        ...originalMirror,
        inventedName: "MIRROR_ONLY_VALUE",
      };
      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(mutated))
      );

      const read = Model.deserialize(
        await contract.read(ctx as any, productCode)
      ) as OtherProductShared;
      expect(read.hasErrors()).toBeUndefined();
      expect(read.inventedName).toBe(created.inventedName);
      expect(read.inventedName).not.toBe("MIRROR_ONLY_VALUE");

      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(originalMirror))
      );
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
      await assertMirrorCopies(updated);

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

    it("deletes the relations", async () => {
      const updatedModel = new OtherProductShared({
        ...updated,
        strengths: [],
        markets: [],
      });

      const updatePayload = preparePayload(updatedModel);
      updated = Model.deserialize(
        await contract.update(ctx as any, updatePayload.serialize())
      ) as OtherProductShared;
      stub.commit();

      expect(updated.hasErrors()).toBeDefined();

      updated = await loadSharedProduct(productCode);
      expect(updated.hasErrors()).toBeUndefined();
      await assertNotSharedRelations(updated);
      // await assertMirrorCopies(updated);

      expect(updated.version).toBe(4);
      expect(updated.strengths).toHaveLength(0);
      expect(updated.markets).toHaveLength(0);

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
        await assertMirrorCopies(newObj);

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
      await expectInMirrorCollection("other_batch_shared", batch.id);
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

      const k = stub.createCompositeKey("other_batch_shared", [
        `${productCode}:${created.id}`,
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
        await expectInMirrorCollection("other_batch_shared", batch.id);
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

    it("Deletes in Bulk", async () => {
      const pk = Model.pk(OtherBatchShared);
      const ids = batchBulk.map((c) => c[pk]) as number[];

      const deleted: OtherBatchShared[] = JSON.parse(
        await batchContract.deleteAll(ctx as any, JSON.stringify(ids))
      ).map((r: any) => Model.deserialize(r));

      stub.commit();

      let count = 0;
      for (const b of deleted) {
        expect(b.hasErrors()).toBeDefined();
        const k = stub.createCompositeKey("other_batch_shared", [
          ids[count++].toString(),
        ]);
        await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", k)
        ).rejects.toThrow(NotFoundError);
      }
    });
  });

  describe("mirror behavior with org-b identity", () => {
    let mirrorProducts: OtherProductShared[];
    let mirrorBatches: OtherBatchShared[];

    function getOrgBCtx() {
      const baseCtx = getMockCtx();
      const orgBStub = Object.create(stub);
      orgBStub.getCreator = async () => ({
        idBytes: Buffer.from("creatorID-org-b"),
        mspid: "org-b",
      });
      orgBStub.getMspID = () => "org-b";
      return Object.assign(baseCtx, {
        stub: orgBStub,
        clientIdentity: {
          getID: () => "id-org-b",
          getMSPID: () => "org-b",
          getIDBytes: () => Buffer.from("creatorID-org-b"),
          getAttributeValue: (name: string) =>
            name === "roles" ? ["admin"] : undefined,
        },
      });
    }

    describe("product mirror", () => {
      it("creates products with Aeon and verifies mirror copies", async () => {
        ctx = getMockCtx();
        Object.assign(ctx, { stub });
        transientSpy = jest.spyOn(
          contract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const models = new Array(5).fill(0).map(() => {
          const id = generateGtin();
          return new OtherProductShared({
            productCode: id,
            inventedName: "mirror_test",
            nameMedicinalProduct: "test",
          });
        });

        const payload = JSON.stringify(preparePayloadBulk(models));
        JSON.parse(await contract.createAll(ctx as any, payload)).map(
          (r: any) => Model.deserialize(r)
        );
        stub.commit();

        const loaded: OtherProductShared[] = [];
        for (const m of models) {
          const product = await loadSharedProduct(m.productCode);
          expect(product.hasErrors()).toBeUndefined();
          await assertMirrorCopies(product);
          loaded.push(product);
        }
        mirrorProducts = loaded;

        jest.restoreAllMocks();
      });

      it("modifies mirror data to prove read exclusivity", async () => {
        const pk = mirrorProducts[0].productCode;
        const key = stub.createCompositeKey("other_product_shared", [pk]);
        const mirrorData = JSON.parse(
          Buffer.from(
            await stub.getPrivateData("mirror-collection", key)
          ).toString("utf8")
        );
        mirrorData.inventedName = "FROM_MIRROR";
        await stub.putPrivateData(
          "mirror-collection",
          key,
          Buffer.from(JSON.stringify(mirrorData))
        );
        stub.commit();

        // Verify shared collection still has original value
        const sharedData = JSON.parse(
          Buffer.from(
            await stub.getPrivateData("decaf-namespaceAeon", key)
          ).toString("utf8")
        );
        expect(sharedData.inventedName).toBe("mirror_test");
      });

      it("rejects product create from org-b", async () => {
        const orgBCtx = getOrgBCtx();
        transientSpy = jest.spyOn(
          contract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const model = new OtherProductShared({
          productCode: generateGtin(),
          inventedName: "org-b-product",
          nameMedicinalProduct: "test",
        });
        const payload = preparePayload(model);

        await expect(
          contract.create(orgBCtx as any, payload.serialize())
        ).rejects.toThrow(AuthorizationError);

        jest.restoreAllMocks();
      });

      it("rejects product update from org-b", async () => {
        const orgBCtx = getOrgBCtx();
        transientSpy = jest.spyOn(
          contract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const model = new OtherProductShared({
          ...mirrorProducts[0],
          inventedName: "org-b-update",
        });
        const payload = preparePayload(model);

        await expect(
          contract.update(orgBCtx as any, payload.serialize())
        ).rejects.toThrow(AuthorizationError);

        jest.restoreAllMocks();
      });

      it("reads product EXCLUSIVELY from mirror collection", async () => {
        const orgBCtx = getOrgBCtx();

        const result = await contract.read(
          orgBCtx as any,
          mirrorProducts[0].productCode
        );
        const read = Model.deserialize(result) as OtherProductShared;
        expect(read.hasErrors()).toBeUndefined();
        expect(read.productCode).toBe(mirrorProducts[0].productCode);
        expect(read.inventedName).toBe("FROM_MIRROR");
      });

      it("lists products EXCLUSIVELY from mirror collection", async () => {
        const orgBCtx = getOrgBCtx();

        const listed = JSON.parse(
          await contract.statement(
            orgBCtx as any,
            "listBy",
            JSON.stringify(["inventedName", "asc"])
          )
        );
        expect(listed).toBeDefined();
        expect(listed.length).toEqual(mirrorProducts.length);
        expect(listed.some((p: any) => p.inventedName === "FROM_MIRROR")).toBe(
          true
        );
      });

      it("paginates products EXCLUSIVELY from mirror collection", async () => {
        const orgBCtx = getOrgBCtx();

        const page = await contract.paginateBy(
          orgBCtx,
          "inventedName",
          "asc",
          JSON.stringify({ offset: 1, limit: 3 })
        );
        expect(page).toBeDefined();

        const parsedPage = Paginator.deserialize(page);
        expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
        expect(parsedPage.data.length).toEqual(3);
        expect(parsedPage.count).toEqual(mirrorProducts.length);
      });
    });

    describe("batch mirror", () => {
      it("creates batches with Aeon and verifies mirror copies", async () => {
        ctx = getMockCtx();
        Object.assign(ctx, { stub });
        transientSpy = jest.spyOn(
          batchContract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const models = new Array(5).fill(0).map((_, i) => {
          const pc = generateGtin();
          return new OtherBatchShared({
            productCode: pc,
            batchNumber: `MB${String(i).padStart(3, "0")}`,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
        });

        const payload = JSON.stringify(preparePayloadBulk(models));
        JSON.parse(await batchContract.createAll(ctx as any, payload)).map(
          (r: any) => Model.deserialize(r)
        );
        stub.commit();

        const loaded: OtherBatchShared[] = [];
        for (const m of models) {
          const batch = await loadSharedBatch(m.productCode, m.batchNumber);
          expect(batch.hasErrors()).toBeUndefined();
          await expectInMirrorCollection("other_batch_shared", batch.id);
          loaded.push(batch);
        }
        mirrorBatches = loaded;

        jest.restoreAllMocks();
      });

      it("modifies mirror data to prove read exclusivity", async () => {
        // Dump mirror data to understand structure
        const batchId = mirrorBatches[0].id;
        const key = stub.createCompositeKey("other_batch_shared", [batchId]);
        const debugData = JSON.parse(
          Buffer.from(
            await stub.getPrivateData("mirror-collection", key)
          ).toString("utf8")
        );
        console.log("BATCH MIRROR DATA:", JSON.stringify(debugData, null, 2));
        const mirrorData = JSON.parse(
          Buffer.from(
            await stub.getPrivateData("mirror-collection", key)
          ).toString("utf8")
        );
        mirrorData.manufacturerName = "FROM_MIRROR_BATCH";
        await stub.putPrivateData(
          "mirror-collection",
          key,
          Buffer.from(JSON.stringify(mirrorData))
        );
        stub.commit();
      });

      it("rejects batch create from org-b", async () => {
        const orgBCtx = getOrgBCtx();
        transientSpy = jest.spyOn(
          batchContract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const model = new OtherBatchShared({
          productCode: generateGtin(),
          batchNumber: "OB000",
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
        const payload = preparePayload(model);

        await expect(
          batchContract.create(orgBCtx as any, payload.serialize())
        ).rejects.toThrow(AuthorizationError);

        jest.restoreAllMocks();
      });

      it("rejects batch update from org-b", async () => {
        const orgBCtx = getOrgBCtx();
        transientSpy = jest.spyOn(
          batchContract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const model = new OtherBatchShared({
          ...mirrorBatches[0],
          manufacturerName: "org-b-update",
        });
        const payload = preparePayload(model);

        await expect(
          batchContract.update(orgBCtx as any, payload.serialize())
        ).rejects.toThrow(AuthorizationError);

        jest.restoreAllMocks();
      });

      it("reads batch EXCLUSIVELY from mirror collection", async () => {
        // Diagnostic: check mirroredAt and mirror data
        const mirrorMeta = (Model as any).mirroredAt(OtherBatchShared);
        expect(mirrorMeta).toBeDefined();
        expect(mirrorMeta.mspId).toBe("org-b");

        const batchKey = stub.createCompositeKey("other_batch_shared", [
          mirrorBatches[0].id,
        ]);
        const rawMirrorData = JSON.parse(
          Buffer.from(
            await stub.getPrivateData("mirror-collection", batchKey)
          ).toString("utf8")
        );
        // Verify mirror copy has required fields
        expect(rawMirrorData.productCode).toBeDefined();
        expect(rawMirrorData.expiryDate).toBeDefined();

        const orgBCtx = getOrgBCtx();

        const result = await batchContract.read(
          orgBCtx as any,
          mirrorBatches[0].id
        );
        const read = Model.deserialize(result) as OtherBatchShared;
        expect(read.hasErrors()).toBeUndefined();
        expect(read.id).toBe(mirrorBatches[0].id);
        expect(read.manufacturerName).toBe("FROM_MIRROR_BATCH");
      });

      it("lists batches EXCLUSIVELY from mirror collection", async () => {
        const orgBCtx = getOrgBCtx();

        const listed = JSON.parse(
          await batchContract.statement(
            orgBCtx as any,
            "listBy",
            JSON.stringify(["batchNumber", "asc"])
          )
        );
        expect(listed).toBeDefined();
        expect(listed.length).toEqual(mirrorBatches.length);
        expect(
          listed.some((b: any) => b.manufacturerName === "FROM_MIRROR_BATCH")
        ).toBe(true);
      });

      it("paginates batches EXCLUSIVELY from mirror collection", async () => {
        const orgBCtx = getOrgBCtx();

        const page = await batchContract.paginateBy(
          orgBCtx,
          "batchNumber",
          "asc",
          JSON.stringify({ offset: 1, limit: 3 })
        );
        expect(page).toBeDefined();

        const parsedPage = Paginator.deserialize(page);
        expect(Paginator.isSerializedPage(parsedPage)).toBe(true);
        expect(parsedPage.data.length).toEqual(3);
        expect(parsedPage.count).toEqual(mirrorBatches.length);
      });
    });

    describe("audit Bulk query and list", () => {
      let auditBulk: OtherAudit[];

      beforeEach(() => {
        ctx = getMockCtx();
        Object.assign(ctx, { stub: stub });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("lists via statement", async () => {
        auditBulk = JSON.parse(
          await auditContract.statement(
            ctx as any,
            "listBy",
            JSON.stringify(["id", "asc"])
          )
        );
        expect(auditBulk).toBeDefined();
      });

      it("Reads in Bulk", async () => {
        const pk = Model.pk(OtherAudit);
        const ids = auditBulk.map((c) => c[pk]) as string[];

        const read: OtherAudit[] = JSON.parse(
          await auditContract.readAll(ctx as any, JSON.stringify(ids))
        ).map((r: any) => Model.deserialize(r));

        for (const b of read) {
          expect(b.hasErrors()).toBeUndefined();
        }
      });
    });
  });
});
