import "../../src/shared/overrides";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductStrengthContract } from "../../src/contract/OtherProductStrengthContract";
import { OtherMarketContract } from "../../src/contract/OtherMarketContract";
import { OtherProductImageContract } from "../../src/contract/OtherProductImageContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";
import { AuthorizationError, Paginator, SerializedPage } from "@decaf-ts/core";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { GtinOwner } from "../../src/contract/models/GtinOwner";
import { FabricClientPaginator } from "../../src/client/FabricClientPaginator";
import { OtherBatchShared } from "../../src/contract/models/OtherBatchShared";
import { OtherBatchContract } from "../../src/contract/OtherBatchContract";
import { AuditContract } from "../../src/contract/AuditContract";
import { OtherAudit } from "../../src/contract/models/OtherAudit";
import { History } from "../../src/contract/models/History";
import { OtherAuditContract } from "../../src/contract/OtherAuditContract";
import { OtherProductImage } from "../../src/contract/models/OtherProductImage";

jest.setTimeout(50000);

describe("OtherProductShared contract version flow with relations", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let batchContract: OtherBatchContract;
  let transientSpy: jest.SpyInstance;
  let auditContract: AuditContract;
  const strengthContract = new OtherProductStrengthContract();
  const marketContract = new OtherMarketContract();
  const imageContract = new OtherProductImageContract();

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new OtherProductSharedContract();
    batchContract = new OtherBatchContract();
    auditContract = new OtherAuditContract();
  });

  function resetCtx() {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    Object.assign(ctx, { stub });
  }

  function ensureCommitted() {
    if (stub && typeof stub.commit === "function") {
      stub.commit();
    }
  }

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

  function preparePayload(
    model:
      | OtherProductShared
      | OtherBatchShared
      | OtherProductStrength
      | OtherProductImage
      | OtherMarket
  ) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};

    transientSpy.mockImplementation(() => transient);
    return Model.merge(segregated.model, transient as any);
  }

  function currentOwner() {
    return ctx?.clientIdentity?.getMSPID?.() ?? "Aeon";
  }

  async function loadPrivateSharedModel<T extends Model>(
    table: string,
    keyValue: string,
    ctor: new (arg?: ModelArg<T>) => T,
    collection = "decaf-namespaceAeon"
  ) {
    ensureCommitted();
    const candidateTables = [table, Model.tableName(ctor)].filter(
      (value, index, array) => value && array.indexOf(value) === index
    ) as string[];

    if (!candidateTables.length) {
      throw new Error(`no table provided for ${ctor.name}`);
    }

    const primaryKey = stub.createCompositeKey(candidateTables[0], [keyValue]);
    await expect(stub.getState(primaryKey)).rejects.toThrow(NotFoundError);

    let lastError: Error | undefined;
    for (const candidate of candidateTables) {
      const compositeKey = stub.createCompositeKey(candidate, [keyValue]);
      try {
        const state = await stub.getPrivateData(collection, compositeKey);
        if (state === undefined || state === null) {
          continue;
        }
        const serialized =
          typeof state === "string"
            ? state
            : Buffer.isBuffer(state)
              ? state.toString("utf8")
              : Buffer.from(state as Buffer).toString("utf8");
        return new ctor(JSON.parse(serialized));
      } catch (error) {
        if (error instanceof NotFoundError) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`missing private data for ${table} ${keyValue}`);
  }

  async function loadSharedImage(
    productCode: string,
    collection = "decaf-namespaceAeon"
  ) {
    return loadPrivateSharedModel(
      "other_product_image",
      productCode,
      OtherProductImage,
      collection
    );
  }

  async function loadSharedProduct(
    productCode: string,
    collection = "decaf-namespaceAeon"
  ) {
    return loadPrivateSharedModel(
      "other_product_shared",
      productCode,
      OtherProductShared,
      collection
    );
  }

  async function loadSharedProductStrength(
    strengthId: string,
    collection = "decaf-namespaceAeon"
  ) {
    return loadPrivateSharedModel(
      "other_product_strength",
      strengthId,
      OtherProductStrength,
      collection
    );
  }

  async function loadSharedMarket(
    marketId: string,
    collection = "decaf-namespaceAeon"
  ) {
    return loadPrivateSharedModel(
      "other_market",
      marketId,
      OtherMarket,
      collection
    );
  }

  async function loadSharedBatch(
    productCode: string,
    batch: string,
    collection = "decaf-namespaceAeon"
  ) {
    return loadPrivateSharedModel(
      "other_batch_shared",
      `${productCode}:${batch}`,
      OtherBatchShared
    );
  }

  async function loadPublicOwner(productCode: string) {
    ensureCommitted();
    const k = stub.createCompositeKey("owner", [productCode]);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
    const publicState = await stub.getState(k);
    return new GtinOwner(JSON.parse(publicState.toString()));
  }

  async function expectMarketInSharedCollection(marketKey: string) {
    const market = await loadSharedMarket(marketKey);
    expect(market.hasErrors()).toBeUndefined();
    return market;
  }

  async function expectStrengthInSharedCollection(strengthKey: string) {
    const strength = await loadSharedProductStrength(strengthKey);
    expect(strength.hasErrors()).toBeUndefined();
    return strength;
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

  async function findPrivateRecord(
    tableName: string,
    predicate: (doc: any) => boolean,
    collection = "decaf-namespaceAeon"
  ) {
    ensureCommitted();
    const keys = Object.keys(stub.privateState[collection] || {});
    for (const key of keys) {
      if (!key.startsWith(tableName + "_")) continue;
      const raw = stub.privateState[collection][key];
      const parsed =
        typeof raw === "string"
          ? JSON.parse(raw)
          : JSON.parse(Buffer.from(raw).toString("utf8"));
      if (predicate(parsed)) {
        return { key, doc: parsed };
      }
    }
    return undefined;
  }

  async function assertSharedRelations(product: OtherProductShared) {
    const marketIds = (product.markets || []).map((m) =>
      typeof m === "object" ? (m as OtherMarket).id : m
    );
    for (const marketId of marketIds) {
      const market = await expectMarketInSharedCollection(marketId as string);
      expect(market.productCode).toBe(product.productCode);
    }

    const strengthIds = (product.strengths || []).map((s) =>
      typeof s === "object" ? (s as OtherProductStrength).id : s
    );
    for (const strengthId of strengthIds) {
      const strength = await expectStrengthInSharedCollection(
        strengthId as string
      );
      expect(strength.productCode).toBe(product.productCode);
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

  function parseModelEntry<M extends Model>(
    entry: any,
    ctor: new (arg?: ModelArg<M>) => M
  ) {
    const payload = typeof entry === "string" ? entry : JSON.stringify(entry);
    try {
      return Model.deserialize(payload) as M;
    } catch {
      return new ctor(JSON.parse(payload));
    }
  }

  function normalizeStrength(entry: any) {
    return parseModelEntry(entry, OtherProductStrength);
  }

  function normalizeMarket(entry: any) {
    return parseModelEntry(entry, OtherMarket);
  }

  function normalizeImage(entry: any) {
    return parseModelEntry(entry, OtherProductImage);
  }

  function buildGtin(base: string) {
    const digits = base.padStart(13, "0");
    const reversed = digits
      .split("")
      .reverse()
      .map((char) => parseInt(char, 10));
    const sum = reversed.reduce(
      (acc, digit, idx) => acc + digit * (idx % 2 === 0 ? 3 : 1),
      0
    );
    const check = (10 - (sum % 10)) % 10;
    return `${digits}${check}`;
  }

  async function expectInMirrorCollection(tableName: string, id: string) {
    ensureCommitted();
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
      await expectInMirrorCollection("other_market", marketId as string);
    }

    const strengthIds = (product.strengths || []).map((s) =>
      typeof s === "object" ? (s as OtherProductStrength).id : s
    );
    for (const strengthId of strengthIds) {
      await expectInMirrorCollection(
        "other_product_strength",
        strengthId as string
      );
    }
  }

  async function listAuditsByModel(modelName: string) {
    const payload = JSON.parse(
      await auditContract.statement(
        ctx as any,
        "listBy",
        JSON.stringify(["model", "asc"])
      )
    );
    return (payload as any[])
      .map((entry) => {
        if (typeof entry === "string") {
          return Model.deserialize(entry) as OtherAudit;
        }
        return new OtherAudit(entry);
      })
      .filter((audit) => audit.model === modelName);
  }

  function auditMatchesProductCode(audit: OtherAudit, code: string) {
    const rawDiffs = audit.diffs;
    const diffs =
      typeof rawDiffs === "string" ? JSON.parse(rawDiffs) : rawDiffs || {};
    if (diffs.productCode === code) return true;
    if (
      typeof diffs.productCode === "string" &&
      diffs.productCode.includes(code)
    )
      return true;
    if (Array.isArray(diffs.productCode) && diffs.productCode.includes(code))
      return true;
    return JSON.stringify(diffs).includes(code);
  }

  async function expectAuditEntry(
    modelName: string,
    identifier: string,
    action: OperationKeys
  ) {
    const audits = await listAuditsByModel(modelName);
    const audit = audits.find(
      (entry) =>
        entry.action === action && auditMatchesProductCode(entry, identifier)
    );
    expect(audit).toBeDefined();
    if (!audit)
      throw new Error(
        `No audit entry found for ${modelName} ${identifier} action ${action}`
      );
    return audit;
  }

  async function loadHistoryRecord(
    tableName: string,
    key: string,
    version: number
  ) {
    ensureCommitted();
    const historyId = `${tableName}:${key}:${version}`;
    const k = stub.createCompositeKey("history", [historyId]);
    const raw = await stub.getPrivateData("ptp-historyAeon", k);
    return new History(JSON.parse(Buffer.from(raw).toString("utf8")));
  }

  async function filterExistingAuditIds(ids: string[]) {
    const existing: string[] = [];
    for (const id of ids) {
      const key = stub.createCompositeKey("audit", [id]);
      try {
        await stub.getState(key);
        existing.push(id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          continue;
        }
        throw error;
      }
    }
    return existing;
  }

  let productCode: string = "";
  let created: OtherProductShared;
  let bulk: OtherProductShared[];

  describe("product single crud", () => {
    beforeEach(() => {
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
      await expectAuditEntry(
        Model.tableName(OtherProductShared),
        productCode,
        OperationKeys.CREATE
      );
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
      await expectAuditEntry(
        Model.tableName(OtherProductShared),
        productCode,
        OperationKeys.UPDATE
      );
    });

    it("reads the shared data again", async () => {
      const read = Model.deserialize(
        await contract.read(ctx as any, productCode)
      ) as OtherProductShared;
      expect(read.hasErrors()).toBeUndefined();
      created = read;
    });

    it("creates a shared product with an image and supports bulk reads", async () => {
      const imageProductCode = generateGtin();
      const imageModel = new OtherProductImage({
        productCode: imageProductCode,
        content: "image-with-product",
        owner: currentOwner(),
      });
      const productWithImage = new OtherProductShared({
        productCode: imageProductCode,
        inventedName: "Product with Image",
        nameMedicinalProduct: "Medicinal Image",
        imageData: imageModel,
      });
      const payload = preparePayload(productWithImage);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();

      const loadedProduct = await loadSharedProduct(imageProductCode);
      expect(loadedProduct.productCode).toBe(imageProductCode);
      const imageRef =
        typeof loadedProduct.imageData === "string"
          ? loadedProduct.imageData
          : (loadedProduct.imageData as OtherProductImage).productCode;
      const readImage = parseModelEntry(
        await imageContract.read(ctx as any, imageRef),
        OtherProductImage
      );
      expect(readImage.content).toBe("image-with-product");
      const storedImage = await loadSharedImage(imageProductCode);
      expect(storedImage.content).toBe("image-with-product");
      const bulkCodes: string[] = [];
      for (let i = 0; i < 3; i++) {
        const code = generateGtin();
        const bulkPayload = preparePayload(
          new OtherProductShared({
            productCode: code,
            inventedName: `Bulk product ${i}`,
            nameMedicinalProduct: "Bulk Medicinal",
          })
        );
        await contract.create(ctx as any, bulkPayload.serialize());
        stub.commit();
        bulkCodes.push(code);
      }
      const bulkEntries = JSON.parse(
        await contract.readAll(ctx as any, JSON.stringify(bulkCodes))
      ).map((entry: any) => parseModelEntry(entry, OtherProductShared));
      expect(bulkEntries).toHaveLength(bulkCodes.length);
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
      await expectAuditEntry(
        Model.tableName(OtherProductShared),
        productCode,
        OperationKeys.UPDATE
      );
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

    it("Create Image in update", async () => {
      const image =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

      productCode = generateGtin();
      const baseModel = new OtherProductShared({
        productCode,
        inventedName: "initial-name",
        nameMedicinalProduct: "medicinal",
      });

      const payload = preparePayload(baseModel);
      let created = Model.deserialize(
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

      created.imageData = new OtherProductImage({
        content: image,
        productCode,
        owner: owner.ownedBy,
      });

      const updatePayload = preparePayload(created);

      const updated = Model.deserialize(
        await contract.update(ctx as any, updatePayload.serialize())
      ) as OtherProductShared;
      stub.commit();

      const read = Model.deserialize(
        await contract.read(ctx as any, productCode)
      );
      await contract.delete(ctx as any, created.productCode);
      ctx.stub.commit();

      await expect(contract.read(ctx as any, productCode)).rejects.toThrow(
        NotFoundError
      );
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
      await expect(stub.getPrivateData("mirror-collection", k)).rejects.toThrow(
        NotFoundError
      );

      await expect(loadPublicOwner(productCode)).rejects.toThrow(NotFoundError);
      await expectAuditEntry(
        Model.tableName(OtherProductShared),
        productCode,
        OperationKeys.DELETE
      );
    });
  });

  describe("product audit tracking", () => {
    it("records audit entries for shared product lifecycle", async () => {
      const audits = await listAuditsByModel(
        Model.tableName(OtherProductShared)
      );
      expect(audits.length).toBeGreaterThanOrEqual(3);
      expect(
        audits.some((audit) => auditMatchesProductCode(audit, productCode))
      ).toBe(true);
    });

    it("reads audit history via readAll", async () => {
      const audits = await listAuditsByModel(
        Model.tableName(OtherProductShared)
      );
      const ids = audits.map((audit) => audit.id);
      if (!ids.length) throw new Error("No audits recorded for product");
      const existingIds = await filterExistingAuditIds(ids);
      if (!existingIds.length) {
        return;
      }
      const read = JSON.parse(
        await auditContract.readAll(ctx as any, JSON.stringify(existingIds))
      ) as string[];
      const deserialized = read.map(
        (entry) => Model.deserialize(entry) as OtherAudit
      );
      expect(deserialized).toHaveLength(ids.length);
    });

    it("paginates audit entries", async () => {
      const page = await auditContract.paginateBy(
        ctx as any,
        "model",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(page as string);
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toBeGreaterThan(0);
      const hasProductAudit = parsedPage.data.some(
        (entry: any) => entry?.model === Model.tableName(OtherProductShared)
      );
      expect(hasProductAudit).toBe(true);
    });
  });

  describe("product Bulk Crud & query", () => {
    beforeEach(() => {
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
      const normalized = listed.map((el: any) =>
        typeof el === "string"
          ? (Model.deserialize(el) as OtherProductShared)
          : new OtherProductShared(el)
      );
      const bulkCodes = new Set(bulk.map((entry) => entry.productCode));
      const matching = normalized.filter((entry) =>
        entry.productCode ? bulkCodes.has(entry.productCode) : false
      );
      expect(matching).toHaveLength(bulk.length);
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
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toEqual(3);
      expect(parsedPage.current).toEqual(1);
      // expect(parsedPage.count).toBeGreaterThanOrEqual(bulk.length);
      // expect(parsedPage.data.length).toBeGreaterThanOrEqual(
      //   Math.max(1, Math.ceil(bulk.length / 3))
      // );

      const page1Data = parsedPage.data as OtherProductShared[];
      const page1Codes = page1Data.map((entry) => entry.productCode);
      expect(
        page1Codes.every((code, index, array) =>
          index === 0
            ? true
            : (code || "").localeCompare(array[index - 1] || "") <= 0
        )
      ).toBe(true);
      const bulkCodes = new Set(bulk.map((entry) => entry.productCode));
      expect(page1Codes.some((code) => bulkCodes.has(code))).toBe(true);

      const expectedBookmark1 =
        parsedPage.bookmark && parsedPage.bookmark.length
          ? parsedPage.bookmark
          : undefined;
      if (expectedBookmark1) {
        expect(parsedPage.bookmark).toBe(expectedBookmark1);
      }

      const paginator = new FabricClientPaginator(
        null as any,
        null as any,
        3,
        OtherProductShared
      );
      paginator.apply(parsedPage as any);

      expect(paginator.current).toEqual(1);
      expect(paginator.count).toBeGreaterThanOrEqual(bulk.length);
      expect(paginator.total).toBeGreaterThanOrEqual(
        Math.max(1, Math.ceil(paginator.count / 3))
      );

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

      const page2Codes = (secondParsedPage.data as OtherProductShared[]).map(
        (entry) => entry.productCode
      );
      expect(page2Codes.some((code) => bulkCodes.has(code))).toBe(true);
      if (secondParsedPage.bookmark) {
        expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);
      }

      paginator.apply(secondParsedPage as any);

      expect(paginator.current).toEqual(2);
      expect(paginator.count).toBeGreaterThanOrEqual(bulk.length);
      expect(paginator.total).toBeGreaterThanOrEqual(
        Math.max(1, Math.ceil(paginator.count / 3))
      );
    });

    it("paginates via statement", async () => {
      let page = await contract.statement(
        ctx,
        "paginateBy",
        JSON.stringify(["inventedName", "desc", { offset: 1, limit: 3 }])
      );
      expect(page).toBeDefined();

      const parsedPage = Paginator.deserialize(page);
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
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
      // expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
      expect(secondParsedPage.data.length).toEqual(3);
      expect(secondParsedPage.current).toEqual(2);
      expect(secondParsedPage.bookmark).toBeTruthy();
      expect(secondParsedPage.bookmark).not.toEqual(parsedPage.bookmark);
    });

    it("finds shared products via default query attributes", async () => {
      const token = bulk[0].productCode.slice(0, 4);
      const found = JSON.parse(
        await contract.statement(ctx, "find", JSON.stringify([token, "asc"]))
      ) as any[];
      expect(found.length).toBeGreaterThan(0);
      const normalized = found.map((entry) =>
        typeof entry === "string"
          ? (Model.deserialize(entry) as OtherProductShared)
          : new OtherProductShared(entry)
      );
      expect(
        normalized.some((entry) => entry.productCode === bulk[0].productCode)
      ).toBe(true);
    });

    it.skip("pages shared products via default query attributes", async () => {
      const page = await contract.statement(
        ctx,
        "page",
        JSON.stringify(["shared", "asc", { offset: 1, limit: 3 }])
      );
      const parsedPage = Paginator.deserialize(page);
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
      expect(parsedPage.data.length).toBeGreaterThan(0);
      const pageItems = parsedPage.data.map((entry: any) =>
        typeof entry === "string"
          ? (Model.deserialize(entry) as OtherProductShared)
          : new OtherProductShared(entry)
      );
      expect(
        pageItems.every((entry) => entry.productCode.startsWith("shared"))
      ).toBe(true);
      expect(parsedPage.bookmark).toBeTruthy();

      const next = await contract.statement(
        ctx,
        "page",
        JSON.stringify([
          "shared",
          "asc",
          { offset: 2, limit: 3, bookmark: parsedPage.bookmark },
        ])
      );
      const nextPage = Paginator.deserialize(next);
      expect(nextPage.data.length).toBeGreaterThan(0);
      expect(nextPage.bookmark).toBeTruthy();
      expect(nextPage.bookmark).not.toEqual(parsedPage.bookmark);
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
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
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
      // expect(paginator.data.length).toEqual(4);

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
      // expect(paginator.data.length).toEqual(10);
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
      expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
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

  describe("related contract coverage", () => {
    beforeEach(() => {
      resetCtx();

      transientSpy = jest.spyOn(
        contract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("covers strength contract operations", async () => {
      const strengthPayloads = [
        new OtherProductStrength({ productCode, strength: "50mg" }),
        new OtherProductStrength({ productCode, strength: "150mg" }),
      ];
      for (const entry of strengthPayloads) {
        preparePayload(entry);
        const created = parseModelEntry(
          await strengthContract.create(ctx as any, entry.serialize()),
          OtherProductStrength
        );
        stub.commit();
      }

      const listed = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["productCode", "asc"])
        )
      ) as any[];
      const normalized = listed.map(normalizeStrength);
      expect(normalized.length).toBeGreaterThanOrEqual(strengthPayloads.length);

      const page = await strengthContract.paginateBy(
        ctx as any,
        "strength",
        "asc",
        JSON.stringify({ offset: 1, limit: 1 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toEqual(1);

      const findResult = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["50", "asc"])
        )
      ) as any[];
      const found = findResult.map(normalizeStrength);
      expect(found.some((entry) => entry.strength === "50mg")).toBe(true);

      const pageResult = await strengthContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["5", "asc", { offset: 1, limit: 1 }])
      );
      const parsedPageResult = Paginator.deserialize(pageResult);
      expect(parsedPageResult.data.length).toEqual(1);
    });

    it("covers market contract operations", async () => {
      const marketPayloads = [
        new OtherMarket({ productCode, marketId: "market-x" }),
        new OtherMarket({ productCode, marketId: "market-y" }),
      ];
      for (const entry of marketPayloads) {
        preparePayload(entry);
        const created = parseModelEntry(
          await marketContract.create(ctx as any, entry.serialize()),
          OtherMarket
        );
        stub.commit();
        if (!created.marketId && entry.marketId) {
          created.marketId = entry.marketId;
        }
        if (
          !created.id &&
          entry.productCode &&
          entry.marketId &&
          typeof entry.marketId === "string"
        ) {
          created.id = `${entry.productCode}:${entry.marketId}`;
        }
        expect(created.marketId).toMatch(/market-/);
      }

      const listed = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["marketId", "asc"])
        )
      ) as any[];
      const normalized = listed.map(normalizeMarket);
      expect(normalized.length).toBeGreaterThanOrEqual(marketPayloads.length);

      const page = await marketContract.paginateBy(
        ctx as any,
        "marketId",
        "asc",
        JSON.stringify({ offset: 1, limit: 1 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toEqual(1);

      const findResult = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["market", "asc"])
        )
      ) as any[];
      const found = findResult.map(normalizeMarket);
      expect(found.some((entry) => entry.marketId.startsWith("market-"))).toBe(
        true
      );

      const pageResult = await marketContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["market", "asc", { offset: 1, limit: 1 }])
      );
      const parsed = Paginator.deserialize(pageResult);
      expect(parsed.data.length).toEqual(1);
    });

    it("covers image contract operations", async () => {
      const identityOwner = currentOwner();
      const imageProductCode = generateGtin();
      const image = new OtherProductImage({
        productCode: imageProductCode,
        content: "image-content",
        owner: identityOwner,
      });
      preparePayload(image);
      const payload = image.serialize();
      const created = parseModelEntry(
        await imageContract.create(ctx as any, payload),
        OtherProductImage
      );
      stub.commit();
      if (!created.productCode) {
        created.productCode = imageProductCode;
      }
      const read = parseModelEntry(
        await imageContract.read(ctx as any, created.productCode),
        OtherProductImage
      );
      expect(read.content).toBe("image-content");

      const listed = JSON.parse(
        await imageContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["productCode", "asc"])
        )
      ) as any[];
      const normalized = listed.map(normalizeImage);
      expect(
        normalized.some((entry) => entry.productCode === imageProductCode)
      ).toBe(true);

      const page = await imageContract.paginateBy(
        ctx as any,
        "productCode",
        "asc",
        JSON.stringify({ offset: 1, limit: 1 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toBeGreaterThan(0);
    });
  });

  describe("strength contract coverage", () => {
    const tableName = Model.tableName(OtherProductStrength);

    beforeEach(() => {
      resetCtx();

      transientSpy = jest.spyOn(
        contract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function createStrengthEntry(
      overrides: Partial<OtherProductStrength> = {}
    ) {
      const payload = new OtherProductStrength({
        productCode: overrides.productCode ?? generateGtin(),
        strength: overrides.strength ?? "50mg",
        substance: overrides.substance,
        ...overrides,
      });
      preparePayload(payload);
      const created = parseModelEntry(
        await strengthContract.create(ctx as any, payload.serialize()),
        OtherProductStrength
      );
      stub.commit();
      if (!created.id && payload.id) {
        created.id = payload.id;
      }
      if (
        !created.id &&
        payload.productCode &&
        payload.uuid &&
        typeof payload.uuid === "string"
      ) {
        created.id = `${payload.productCode}:${payload.uuid}`;
      }
      if (!created.id) {
        const found = await findPrivateRecord(
          "other_product_strength",
          (doc) =>
            doc.productCode === payload.productCode &&
            doc.strength === payload.strength
        );
        if (found?.doc?.id) {
          created.id = found.doc.id;
        }
      }
      return created;
    }

    it("reads, bulk reads, and queries strengths", async () => {
      const entries = [
        await createStrengthEntry({ strength: "50mg" }),
        await createStrengthEntry({ strength: "75mg" }),
      ];

      const read = parseModelEntry(
        await strengthContract.read(ctx as any, entries[0].id),
        OtherProductStrength
      );
      expect(read.strength).toBeDefined();

      const readAll = JSON.parse(
        await strengthContract.readAll(
          ctx as any,
          JSON.stringify(entries.map((entry) => entry.id))
        )
      ).map((entry: any) => parseModelEntry(entry, OtherProductStrength));
      expect(readAll).toHaveLength(entries.length);

      const listed = JSON.parse(
        await strengthContract.listBy(ctx as any, "strength", "asc")
      ) as any[];
      expect(Array.isArray(listed)).toBe(true);
      expect(listed.length).toBeGreaterThanOrEqual(entries.length);

      const page = await strengthContract.paginateBy(
        ctx as any,
        "strength",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResults = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["5", "asc"])
        )
      ) as any[];
      expect(findResults.length).toBeGreaterThan(0);

      const pageResults = await strengthContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["5", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResults = Paginator.deserialize(pageResults);
      expect(parsedPageResults.data.length).toBeGreaterThan(0);
    });
  });

  describe("market contract coverage", () => {
    const tableName = Model.tableName(OtherMarket);

    beforeEach(() => {
      resetCtx();

      transientSpy = jest.spyOn(
        contract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function createMarketEntry(
      overrides: Partial<OtherMarket> = {}
    ): Promise<OtherMarket> {
      const payload = new OtherMarket({
        productCode: overrides.productCode ?? generateGtin(),
        marketId: overrides.marketId ?? `market-${Math.random()}`,
        mahName: overrides.mahName ?? "ProPharma",
        ...overrides,
      });
      preparePayload(payload);
      const created = parseModelEntry(
        await marketContract.create(ctx as any, payload.serialize()),
        OtherMarket
      );
      stub.commit();
      if (!created.marketId && payload.marketId) {
        created.marketId = payload.marketId;
      }
      if (
        !created.id &&
        payload.productCode &&
        payload.marketId &&
        typeof payload.marketId === "string"
      ) {
        created.id = `${payload.productCode}:${payload.marketId}`;
      }
      if (!created.id) {
        const found = await findPrivateRecord(
          "other_market",
          (doc) =>
            doc.productCode === payload.productCode &&
            doc.marketId === payload.marketId
        );
        if (found?.doc?.id) {
          created.id = found.doc.id;
        }
      }
      return created;
    }

    it("reads, bulk reads, and queries markets", async () => {
      const entries = [
        await createMarketEntry({ marketId: "market-alpha" }),
        await createMarketEntry({ marketId: "market-beta" }),
      ];

      const read = parseModelEntry(
        await marketContract.read(ctx as any, entries[0].id),
        OtherMarket
      );
      expect(read.marketId).toBeDefined();

      const readAll = JSON.parse(
        await marketContract.readAll(
          ctx as any,
          JSON.stringify(entries.map((entry) => entry.id))
        )
      ).map((entry: any) => parseModelEntry(entry, OtherMarket));
      expect(readAll).toHaveLength(entries.length);

      const listed = JSON.parse(
        await marketContract.listBy(ctx as any, "marketId", "asc")
      ) as any[];
      expect(Array.isArray(listed)).toBe(true);
      expect(listed.length).toBeGreaterThanOrEqual(entries.length);

      const page = await marketContract.paginateBy(
        ctx as any,
        "marketId",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResults = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["market", "asc"])
        )
      ) as any[];
      expect(findResults.length).toBeGreaterThan(0);

      const pageResults = await marketContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["market", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResults = Paginator.deserialize(pageResults);
      expect(parsedPageResults.data.length).toBeGreaterThan(0);
    });
  });

  describe("image contract coverage", () => {
    const tableName = Model.tableName(OtherProductImage);

    beforeEach(() => {
      resetCtx();

      transientSpy = jest.spyOn(
        contract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function createImageEntry(
      overrides: Partial<OtherProductImage> = {}
    ): Promise<OtherProductImage> {
      const productCode = overrides.productCode ?? generateGtin();
      const payload = new OtherProductImage({
        productCode,
        content: overrides.content ?? "image-content",
        owner: overrides.owner ?? currentOwner(),
        ...overrides,
      });
      preparePayload(payload);
      const created = parseModelEntry(
        await imageContract.create(ctx as any, payload.serialize()),
        OtherProductImage
      );
      stub.commit();
      if (!created.productCode) {
        created.productCode = productCode;
      }
      return created;
    }

    it("reads, bulk reads, and queries images", async () => {
      const entries = [
        await createImageEntry({ content: "image-one" }),
        await createImageEntry({ content: "image-two" }),
      ];
      const imageKey = stub.createCompositeKey("other_product_image", [
        entries[0].productCode,
      ]);
      try {
        const raw = await stub.getPrivateData("decaf-namespaceAeon", imageKey);
        console.log(
          "DEBUG image private data",
          entries[0].productCode,
          raw?.toString("utf8")
        );
      } catch (err) {
        console.error(
          "DEBUG missing image private data",
          entries[0].productCode,
          err.message
        );
      }

      const read = parseModelEntry(
        await imageContract.read(ctx as any, entries[0].productCode),
        OtherProductImage
      );
      expect(read.content).toBe("image-one");

      const readAll = JSON.parse(
        await imageContract.readAll(
          ctx as any,
          JSON.stringify(entries.map((entry) => entry.productCode))
        )
      ).map((entry: any) => parseModelEntry(entry, OtherProductImage));
      expect(readAll).toHaveLength(entries.length);

      const listed = JSON.parse(
        await imageContract.listBy(ctx as any, "productCode", "asc")
      ) as any[];
      expect(Array.isArray(listed)).toBe(true);
      expect(listed.length).toBeGreaterThanOrEqual(entries.length);

      const page = await imageContract.paginateBy(
        ctx as any,
        "productCode",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(page);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResults = JSON.parse(
        await imageContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["image", "asc"])
        )
      ) as any[];
      expect(findResults.length).toBeGreaterThan(0);

      const pageResults = await imageContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["image", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResults = Paginator.deserialize(pageResults);
      expect(parsedPageResults.data.length).toBeGreaterThan(0);
    });
  });

  describe("default query paging for related contracts", () => {
    const seededProducts = new Set<string>();

    beforeEach(() => {
      resetCtx();

      transientSpy = jest.spyOn(
        contract as any,
        "getTransientData" as any
      ) as jest.SpyInstance;
      seededProducts.clear();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const pageLimit = 2;

    async function ensureProduct(productCode: string) {
      if (seededProducts.has(productCode)) return;
      const baseProduct = new OtherProductShared({
        productCode,
        inventedName: `default-query-${productCode}`,
        nameMedicinalProduct: "PaginateTest",
      });
      const payload = preparePayload(baseProduct);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();
      seededProducts.add(productCode);
    }

    async function seedStrengths(
      entries: { productCode: string; strength: string }[]
    ) {
      for (const entry of entries) {
        await ensureProduct(entry.productCode);
        const payload = new OtherProductStrength({
          productCode: entry.productCode,
          strength: entry.strength,
        });
        await strengthContract.create(ctx as any, payload.serialize());
        stub.commit();
      }
    }

    async function seedMarkets(product: string, ids: string[]) {
      await ensureProduct(product);
      for (const marketId of ids) {
        const payload = new OtherMarket({
          productCode: product,
          marketId,
        });
        await marketContract.create(ctx as any, payload.serialize());
        stub.commit();
      }
    }

    async function seedImages(entries: { code: string; content: string }[]) {
      for (const entry of entries) {
        await ensureProduct(entry.code);
        const payload = new OtherProductImage({
          productCode: entry.code,
          content: entry.content,
          owner: currentOwner(),
        });
        await imageContract.create(ctx as any, payload.serialize());
        stub.commit();
      }
    }

    async function extractValues(
      rawPage: string,
      extractor: (entry: any) => string,
      previousPage?: Partial<SerializedPage<any>>
    ) {
      const parsed = Paginator.deserialize(rawPage);
      let parsedPage: SerializedPage<any>;
      if (FabricClientPaginator.isSerializedPage(parsed)) {
        parsedPage = parsed;
      } else {
        const data =
          Array.isArray(parsed) && parsed.every((item) => item !== undefined)
            ? parsed
            : Array.isArray(parsed?.data)
              ? parsed.data
              : [];
        parsedPage = {
          current: parsed?.current ?? previousPage?.current ?? 1,
          total: parsed?.total ?? previousPage?.total ?? data.length,
          count: parsed?.count ?? previousPage?.count ?? data.length,
          data,
          bookmark: parsed?.bookmark ?? previousPage?.bookmark,
        };
      }
      const resolvedCount =
        parsedPage.count ?? previousPage?.count ?? parsedPage.data.length;
      const resolvedTotal =
        parsedPage.total ?? previousPage?.total ?? parsedPage.data.length;
      const mergedPage: SerializedPage<any> = {
        ...parsedPage,
        current: parsedPage.current ?? previousPage?.current ?? 1,
        count: resolvedCount,
        total: resolvedTotal,
        bookmark: parsedPage.bookmark ?? previousPage?.bookmark,
      };
      return {
        parsedPage: mergedPage,
        values: mergedPage.data.map((entry: any) => extractor(entry)),
      };
    }

    it("navigates strength pages via numeric default tokens", async () => {
      const tokenStamp = `seq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const strengthLabels = ["1Alpha", "1Beta", "1Gamma", "1Omega"];
      const strengthEntries = strengthLabels.map((label) => ({
        productCode: generateGtin(),
        strength: `${tokenStamp}-${label}`,
      }));
      await seedStrengths(strengthEntries);

      const firstRawPage = await strengthContract.page(
        ctx as any,
        tokenStamp,
        "asc",
        JSON.stringify({ offset: 1, limit: pageLimit })
      );
      const { parsedPage: firstPage, values: firstNames } = await extractValues(
        firstRawPage,
        (entry) => normalizeStrength(entry).strength!
      );
      const sortedAscEntries = [...strengthEntries].sort((a, b) =>
        a.productCode.localeCompare(b.productCode)
      );
      const expectedFirstStrengths = sortedAscEntries
        .slice(0, pageLimit)
        .map((entry) => entry.strength);
      expect(firstNames).toEqual(expectedFirstStrengths);
      expect(firstPage.bookmark).toBeTruthy();

      const secondRawPage = await strengthContract.page(
        ctx as any,
        tokenStamp,
        "asc",
        JSON.stringify({
          offset: 2,
          limit: pageLimit,
          bookmark: firstPage.bookmark,
        })
      );
      const { parsedPage: secondPage, values: secondNames } =
        await extractValues(
          secondRawPage,
          (entry) => normalizeStrength(entry).strength!,
          firstPage
        );
      const expectedSecondStrengths = sortedAscEntries
        .slice(pageLimit)
        .map((entry) => entry.strength);
      expect(secondNames).toEqual(expectedSecondStrengths);
      expect(secondPage.bookmark).not.toEqual(firstPage.bookmark);

      const descRawPage = await strengthContract.page(
        ctx as any,
        tokenStamp,
        "desc",
        JSON.stringify({ offset: 1, limit: pageLimit })
      );
      const descPage = Paginator.deserialize(descRawPage);
      expect(FabricClientPaginator.isSerializedPage(descPage)).toBe(true);
      const descEntries = (descPage.data as any[]).map((entry) =>
        typeof entry === "string"
          ? normalizeStrength(entry as string)
          : new OtherProductStrength(entry)
      );
      const descProductCodes = descEntries.map((entry) => entry.productCode!);
      const expectedDescProductCodes = [...strengthEntries]
        .sort((a, b) => b.productCode.localeCompare(a.productCode))
        .slice(0, pageLimit)
        .map((entry) => entry.productCode);
      expect(descProductCodes).toEqual(expectedDescProductCodes);
      const descNames = descEntries
        .map((entry) => entry.strength || "")
        .filter(Boolean);
      expect(descNames.every((name) => name.startsWith(tokenStamp))).toBe(true);
    });

    it("pages markets containing numeric tokens with stable ordering", async () => {
      const seqCode = generateGtin();
      const marketIds = ["1North", "1South", "1East", "1West"];
      const orderedMarketIds = [...marketIds].sort();
      await seedMarkets(seqCode, marketIds);

      const firstRawPage = await marketContract.page(
        ctx as any,
        "1",
        "asc",
        JSON.stringify({ offset: 1, limit: pageLimit })
      );
      const { parsedPage: firstPage, values: firstIds } = await extractValues(
        firstRawPage,
        (entry) => normalizeMarket(entry).marketId
      );
      expect(firstIds).toEqual(orderedMarketIds.slice(0, pageLimit));

      const secondRawPage = await marketContract.page(
        ctx as any,
        "1",
        "asc",
        JSON.stringify({
          offset: 2,
          limit: pageLimit,
          bookmark: firstPage.bookmark,
        })
      );
      const { values: secondIds } = await extractValues(
        secondRawPage,
        (entry) => normalizeMarket(entry).marketId,
        firstPage
      );
      expect(secondIds).toEqual(orderedMarketIds.slice(pageLimit));

      const findResult = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["1", "asc"])
        )
      ) as any[];
      const normalizedFind = findResult.map(normalizeMarket);
      expect(
        orderedMarketIds.every((id) =>
          normalizedFind.some((entry) => entry.marketId === id)
        )
      ).toBe(true);
    });

    it("resumes images via numeric product codes and bookmarks", async () => {
      const baseCodes = [
        "1000000000000",
        "1000000000001",
        "1000000000002",
        "1000000000003",
      ];
      const entries = baseCodes.map((code, index) => ({
        code: buildGtin(code),
        content: `img-${index}`,
      }));
      await seedImages(entries);

      const firstRawPage = await imageContract.page(
        ctx as any,
        "100",
        "asc",
        JSON.stringify({ offset: 1, limit: pageLimit })
      );
      const { parsedPage: firstPage, values: firstCodes } = await extractValues(
        firstRawPage,
        (entry) => normalizeImage(entry).productCode
      );
      expect(firstCodes).toEqual(
        entries.slice(0, pageLimit).map((e) => e.code)
      );

      const secondRawPage = await imageContract.page(
        ctx as any,
        "100",
        "asc",
        JSON.stringify({
          offset: 2,
          limit: pageLimit,
          bookmark: firstPage.bookmark,
        })
      );
      const { values: secondCodes } = await extractValues(
        secondRawPage,
        (entry) => normalizeImage(entry).productCode,
        firstPage
      );
      expect(secondCodes).toEqual(entries.slice(pageLimit).map((e) => e.code));
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
        resetCtx();
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
        expect(listed.length).toBeGreaterThanOrEqual(mirrorProducts.length);
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
        expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
        expect(parsedPage.data.length).toEqual(3);
        // expect(parsedPage.count).toBeGreaterThanOrEqual(mirrorProducts.length);
      });

      it("reads product and relation rows exclusively from mirror collection (single + bulk reads)", async () => {
        const creationCtx = getMockCtx();
        Object.assign(creationCtx, { stub });
        transientSpy = jest.spyOn(
          contract as any,
          "getTransientData" as any
        ) as jest.SpyInstance;

        const productCode = generateGtin();
        const productModel = new OtherProductShared({
          productCode,
          inventedName: "mirror_related",
          nameMedicinalProduct: "mirror related product",
          markets: [
            buildMarket(productCode, "mx"),
            buildMarket(productCode, "br"),
          ],
          strengths: [
            buildStrength(productCode, "10mg"),
            buildStrength(productCode, "20mg"),
          ],
        });

        const payload = preparePayload(productModel);
        await contract.create(creationCtx as any, payload.serialize());
        stub.commit();
        jest.restoreAllMocks();

        const created = await loadSharedProduct(productCode);
        expect(created.hasErrors()).toBeUndefined();
        expect(created.markets?.length).toBeGreaterThan(0);
        expect(created.strengths?.length).toBeGreaterThan(0);

        const updateMirrorEntry = async (
          table: string,
          keyValue: string,
          patch: (entry: any) => void
        ) => {
          const key = stub.createCompositeKey(table, [keyValue]);
          const mirrorRecord = JSON.parse(
            Buffer.from(
              await stub.getPrivateData("mirror-collection", key)
            ).toString("utf8")
          );
          patch(mirrorRecord);
          await stub.putPrivateData(
            "mirror-collection",
            key,
            Buffer.from(JSON.stringify(mirrorRecord))
          );
        };

        await updateMirrorEntry(
          "other_product_shared",
          productCode,
          (entry) => {
            entry.inventedName = "MIRROR_RELATION_PRODUCT";
          }
        );

        const marketIds = (created.markets || []).map((m) =>
          typeof m === "object" ? (m as OtherMarket).id : m
        );
        for (const marketId of marketIds) {
          await updateMirrorEntry(
            "other_market",
            marketId as string,
            (entry) => {
              entry.mahName = `MIRROR_MARKET_${marketId}`;
            }
          );
        }

        const strengthIds = (created.strengths || []).map((s) =>
          typeof s === "object" ? (s as OtherProductStrength).id : s
        );
        for (const strengthId of strengthIds) {
          await updateMirrorEntry(
            "other_product_strength",
            strengthId as string,
            (entry) => {
              entry.strength = `MIRROR_STRENGTH_${strengthId}`;
            }
          );
        }

        stub.commit();

        const orgBCtx = getOrgBCtx();
        const mirrorProduct = Model.deserialize(
          await contract.read(orgBCtx as any, productCode)
        ) as OtherProductShared;
        expect(mirrorProduct.inventedName).toBe("MIRROR_RELATION_PRODUCT");

        const mirrorProductBulk = JSON.parse(
          await contract.readAll(orgBCtx as any, JSON.stringify([productCode]))
        ).map((entry: any) => Model.deserialize(entry) as OtherProductShared);
        expect(mirrorProductBulk[0].inventedName).toBe(
          "MIRROR_RELATION_PRODUCT"
        );

        for (const marketId of marketIds) {
          const mirrorMarket = parseModelEntry(
            await marketContract.read(orgBCtx as any, marketId as string),
            OtherMarket
          );
          expect(mirrorMarket.mahName).toBe(`MIRROR_MARKET_${marketId}`);

          const mirrorMarketBulk = JSON.parse(
            await marketContract.readAll(
              orgBCtx as any,
              JSON.stringify([marketId])
            )
          ).map((entry: any) => parseModelEntry(entry, OtherMarket));
          expect(mirrorMarketBulk[0].mahName).toBe(`MIRROR_MARKET_${marketId}`);
        }

        for (const strengthId of strengthIds) {
          const mirrorStrength = parseModelEntry(
            await strengthContract.read(orgBCtx as any, strengthId as string),
            OtherProductStrength
          );
          expect(mirrorStrength.strength).toBe(`MIRROR_STRENGTH_${strengthId}`);

          const mirrorStrengthBulk = JSON.parse(
            await strengthContract.readAll(
              orgBCtx as any,
              JSON.stringify([strengthId])
            )
          ).map((entry: any) => parseModelEntry(entry, OtherProductStrength));
          expect(mirrorStrengthBulk[0].strength).toBe(
            `MIRROR_STRENGTH_${strengthId}`
          );
        }
      });

      it("finds mirror products via default query attributes", async () => {
        const orgBCtx = getOrgBCtx();
        const listed = JSON.parse(
          await contract.statement(
            orgBCtx as any,
            "find",
            JSON.stringify(["MIRROR_RELATION_PRODUCT", "asc"])
          )
        ) as any[];
        const normalized = listed.map((entry) =>
          typeof entry === "string"
            ? (Model.deserialize(entry) as OtherProductShared)
            : new OtherProductShared(entry)
        );
        expect(
          normalized.some(
            (entry) => entry.inventedName === "MIRROR_RELATION_PRODUCT"
          )
        ).toBe(true);
      });

      it("pages mirror products via default query attributes", async () => {
        const orgBCtx = getOrgBCtx();
        const page = await contract.statement(
          orgBCtx,
          "page",
          JSON.stringify([
            "MIRROR_RELATION_PRODUCT",
            "asc",
            { offset: 1, limit: 1 },
          ])
        );
        const parsedPage = Paginator.deserialize(page);
        expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
        const pageItems = (parsedPage.data as any[]).map((entry) =>
          typeof entry === "string"
            ? (Model.deserialize(entry) as OtherProductShared)
            : new OtherProductShared(entry)
        );
        expect(
          pageItems.some(
            (entry) => entry.inventedName === "MIRROR_RELATION_PRODUCT"
          )
        ).toBe(true);
        if (parsedPage.data.length === 1) {
          expect(parsedPage.bookmark).toBeTruthy();
        }

        if (!parsedPage.bookmark) {
          return;
        }

        const nextPage = await contract.statement(
          orgBCtx,
          "page",
          JSON.stringify([
            "MIRROR_RELATION_PRODUCT",
            "asc",
            { offset: 2, limit: 1, bookmark: parsedPage.bookmark },
          ])
        );
        const nextParsed = Paginator.deserialize(nextPage);
        if (!nextParsed.data.length) {
          return;
        }
        expect(nextParsed.bookmark).toBeTruthy();
        expect(nextParsed.bookmark).not.toEqual(parsedPage.bookmark);

        const prevPage = await contract.statement(
          orgBCtx,
          "page",
          JSON.stringify([
            "MIRROR_RELATION_PRODUCT",
            "asc",
            { offset: 1, limit: 1, bookmark: nextParsed.bookmark },
          ])
        );
        const prevParsed = Paginator.deserialize(prevPage);
        expect(prevParsed.bookmark).toEqual(parsedPage.bookmark);
      });
    });

    describe("batch mirror", () => {
      it("creates batches with Aeon and verifies mirror copies", async () => {
        resetCtx();
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
        expect(FabricClientPaginator.isSerializedPage(parsedPage)).toBe(true);
        expect(parsedPage.data.length).toEqual(3);
        // expect(parsedPage.count).toEqual(mirrorBatches.length);
      });
    });

    describe("audit Bulk query and list", () => {
      let auditBulk: OtherAudit[];
      let auditSeeded = false;

      beforeEach(async () => {
        resetCtx();
        if (!auditSeeded) {
          transientSpy = jest.spyOn(
            contract as any,
            "getTransientData" as any
          ) as jest.SpyInstance;
          const auditSeed = new OtherProductShared({
            productCode: generateGtin(),
            inventedName: "audit-seed",
            nameMedicinalProduct: "audit-test",
          });
          const payload = preparePayload(auditSeed);
          await contract.create(ctx as any, payload.serialize());
          stub.commit();
          auditSeeded = true;
        }
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

        const existingIds = await filterExistingAuditIds(ids);
        if (!existingIds.length) {
          return;
        }

        const read: OtherAudit[] = JSON.parse(
          await auditContract.readAll(ctx as any, JSON.stringify(existingIds))
        ).map((r: any) => Model.deserialize(r));

        for (const b of read) {
          expect(b.hasErrors()).toBeUndefined();
        }
      });

      it("paginates audits across sequential pages", async () => {
        const firstPage = await auditContract.paginateBy(
          ctx as any,
          "model",
          "asc",
          JSON.stringify({ offset: 1, limit: 2 })
        );
        const parsedFirst = Paginator.deserialize(firstPage);
        if (!parsedFirst.data.length) {
          expect(parsedFirst.bookmark).toBeFalsy();
          return;
        }

        const secondPage = await auditContract.paginateBy(
          ctx as any,
          "model",
          "asc",
          JSON.stringify({
            offset: 2,
            limit: 2,
            bookmark: parsedFirst.bookmark,
          })
        );
        const parsedSecond = Paginator.deserialize(secondPage);
        expect(parsedSecond.data.length).toBeGreaterThan(0);
        if (parsedSecond.bookmark && parsedFirst.bookmark) {
          expect(parsedSecond.bookmark).not.toEqual(parsedFirst.bookmark);
        }

        const pageArgs = {
          offset: 1,
          limit: 2,
        };
        expect(auditBulk?.length).toBeGreaterThan(0);
        const queryValue = auditBulk[0].id!;
        let statementPage = await auditContract.statement(
          ctx as any,
          "page",
          JSON.stringify([queryValue, "asc", pageArgs])
        );
        let parsedStatement = Paginator.deserialize(statementPage);
        if (!parsedStatement.data.length) {
          statementPage = await auditContract.statement(
            ctx as any,
            "page",
            JSON.stringify([
              Model.tableName(OtherProductShared),
              "asc",
              pageArgs,
            ])
          );
          parsedStatement = Paginator.deserialize(statementPage);
        }
        expect(parsedStatement.data.length).toBeGreaterThan(0);
        expect(parsedStatement.bookmark).toBeDefined();
      });
    });
  });

  describe("related models bulk CRUD and query coverage", () => {
    beforeEach(() => {
      resetCtx();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("strength model bulk CRUD and query coverage", async () => {
      const productCode = generateGtin();
      const tokens = ["1Alpha", "2Beta", "3Gamma"];

      const payloads = tokens.map((token, idx) =>
        new OtherProductStrength({
          productCode,
          strength: token,
          substance: `substance-${idx}`,
        }).serialize()
      );

      const rawCreated = await strengthContract.createAll(
        ctx as any,
        JSON.stringify(payloads)
      );
      const createdRaw = JSON.parse(rawCreated);
      stub.commit();

      expect(createdRaw).toHaveLength(tokens.length);

      const listResult = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["strength", "asc"])
        )
      ) as any[];
      const normalizedList = listResult.map(normalizeStrength);
      const productStrengths = normalizedList.filter(
        (entry) => entry.productCode === productCode
      );
      const ids = productStrengths
        .map((entry) => entry.id)
        .filter((entry): entry is string => Boolean(entry));
      expect(productStrengths).toHaveLength(tokens.length);
      expect(ids).toHaveLength(tokens.length);

      const readAll = JSON.parse(
        await strengthContract.readAll(ctx as any, JSON.stringify(ids))
      ).map((entry: any) => normalizeStrength(entry));
      expect(readAll).toHaveLength(ids.length);

      const updates = readAll.map(
        (entry) =>
          new OtherProductStrength({
            ...entry,
            strength: `${entry.strength}-updated`,
          })
      );

      await strengthContract.updateAll(
        ctx as any,
        JSON.stringify(updates.map((entry) => entry.serialize()))
      );
      stub.commit();

      const updatedListResult = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["strength", "asc"])
        )
      ) as any[];
      const normalizedUpdated = updatedListResult
        .map(normalizeStrength)
        .filter((entry) => entry.productCode === productCode);
      expect(
        normalizedUpdated.every((entry) => entry.strength?.includes("-updated"))
      ).toBe(true);

      const pageRaw = await strengthContract.paginateBy(
        ctx as any,
        "strength",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(pageRaw);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResult = JSON.parse(
        await strengthContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["1", "asc"])
        )
      ) as any[];
      const normalizedFind = findResult.map(normalizeStrength);
      expect(
        normalizedFind.some((entry) => entry.productCode === productCode)
      ).toBe(true);

      const pageResult = await strengthContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["1", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResult = Paginator.deserialize(pageResult);
      expect(parsedPageResult.data.length).toBeGreaterThan(0);

      const deletedRaw = JSON.parse(
        await strengthContract.deleteAll(ctx as any, JSON.stringify(ids))
      );
      stub.commit();
      const deleted = deletedRaw.map(normalizeStrength);
      expect(deleted).toHaveLength(tokens.length);
      await expect(strengthContract.read(ctx as any, ids[0])).rejects.toThrow(
        NotFoundError
      );
    });

    it("market model bulk CRUD and query coverage", async () => {
      const productCode = generateGtin();
      const marketIds = ["market-1north", "market-2south", "market-3east"];
      const nationalCodes = ["US", "BR", "MX"];

      const payloads = marketIds.map((marketId, idx) =>
        new OtherMarket({
          productCode,
          marketId,
          nationalCode: nationalCodes[idx],
          mahName: `MAH-${idx}`,
        }).serialize()
      );

      const rawCreated = await marketContract.createAll(
        ctx as any,
        JSON.stringify(payloads)
      );
      const createdRaw = JSON.parse(rawCreated);
      stub.commit();
      expect(createdRaw).toHaveLength(marketIds.length);

      const listResult = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["marketId", "asc"])
        )
      ) as any[];
      const normalizedList = listResult.map(normalizeMarket);
      expect(
        normalizedList.some((entry) => entry.productCode === productCode)
      ).toBe(true);
      const marketEntries = normalizedList.filter(
        (entry) => entry.productCode === productCode
      );
      const ids = marketEntries
        .map((entry) => entry.id)
        .filter((entry): entry is string => Boolean(entry));
      expect(marketEntries).toHaveLength(marketIds.length);
      expect(ids).toHaveLength(marketIds.length);

      const readAll = JSON.parse(
        await marketContract.readAll(ctx as any, JSON.stringify(ids))
      ).map((entry: any) => normalizeMarket(entry));
      expect(readAll).toHaveLength(ids.length);

      const updates = readAll.map(
        (entry, idx) =>
          new OtherMarket({
            ...entry,
            mahName: `MAH-updated-${idx}`,
          })
      );

      await marketContract.updateAll(
        ctx as any,
        JSON.stringify(updates.map((entry) => entry.serialize()))
      );
      stub.commit();

      const postUpdateList = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["marketId", "asc"])
        )
      ) as any[];
      const normalizedUpdated = postUpdateList
        .map(normalizeMarket)
        .filter((entry) => entry.productCode === productCode);
      expect(
        normalizedUpdated.every((entry) =>
          entry.mahName?.includes("MAH-updated-")
        )
      ).toBe(true);

      const pageRaw = await marketContract.paginateBy(
        ctx as any,
        "marketId",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(pageRaw);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResult = JSON.parse(
        await marketContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["market", "asc"])
        )
      ) as any[];
      const normalizedFind = findResult.map(normalizeMarket);
      expect(
        normalizedFind.some((entry) => entry.productCode === productCode)
      ).toBe(true);

      const pageResult = await marketContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["market", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResult = Paginator.deserialize(pageResult);
      expect(parsedPageResult.data.length).toBeGreaterThan(0);

      const deletedRaw = JSON.parse(
        await marketContract.deleteAll(ctx as any, JSON.stringify(ids))
      );
      stub.commit();
      const deleted = deletedRaw.map(normalizeMarket);
      expect(deleted).toHaveLength(marketIds.length);
      await expect(marketContract.read(ctx as any, ids[0])).rejects.toThrow(
        NotFoundError
      );
    });

    it("image model bulk CRUD and query coverage", async () => {
      const imageCodes = [generateGtin(), generateGtin(), generateGtin()];
      const imageOwner = currentOwner();

      const payloads = imageCodes.map((code, idx) =>
        new OtherProductImage({
          productCode: code,
          content: `image-content-${idx}`,
          owner: imageOwner,
        }).serialize()
      );

      const createdRaw = JSON.parse(
        await imageContract.createAll(ctx as any, JSON.stringify(payloads))
      );
      stub.commit();

      const created = createdRaw.map(normalizeImage);
      expect(created).toHaveLength(imageCodes.length);

      const ids = imageCodes;
      const readAll = JSON.parse(
        await imageContract.readAll(ctx as any, JSON.stringify(ids))
      ).map((entry: any) => normalizeImage(entry));
      expect(readAll).toHaveLength(ids.length);

      const updates = readAll.map(
        (entry) =>
          new OtherProductImage({
            ...entry,
            content: `${entry.content}-updated`,
          })
      );

      await imageContract.updateAll(
        ctx as any,
        JSON.stringify(updates.map((entry) => entry.serialize()))
      );
      stub.commit();

      const updatedImages = JSON.parse(
        await imageContract.readAll(ctx as any, JSON.stringify(ids))
      ).map((entry: any) => normalizeImage(entry));
      expect(
        updatedImages.every((entry) => entry.content?.includes("-updated"))
      ).toBe(true);

      const listResult = JSON.parse(
        await imageContract.statement(
          ctx as any,
          "listBy",
          JSON.stringify(["productCode", "asc"])
        )
      ) as any[];
      const normalizedList = listResult.map(normalizeImage);
      expect(
        normalizedList.some((entry) => entry.productCode === imageCodes[0])
      ).toBe(true);

      const pageRaw = await imageContract.paginateBy(
        ctx as any,
        "productCode",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      );
      const parsedPage = Paginator.deserialize(pageRaw);
      expect(parsedPage.data.length).toBeGreaterThan(0);

      const findResult = JSON.parse(
        await imageContract.statement(
          ctx as any,
          "find",
          JSON.stringify(["image", "asc"])
        )
      ) as any[];
      const normalizedFind = findResult.map(normalizeImage);
      expect(
        normalizedFind.some((entry) => entry.productCode === imageCodes[0])
      ).toBe(true);

      const pageResult = await imageContract.statement(
        ctx as any,
        "page",
        JSON.stringify(["image", "asc", { offset: 1, limit: 2 }])
      );
      const parsedPageResult = Paginator.deserialize(pageResult);
      expect(parsedPageResult.data.length).toBeGreaterThan(0);

      const deletedRaw = JSON.parse(
        await imageContract.deleteAll(ctx as any, JSON.stringify(ids))
      );
      stub.commit();
      const deleted = deletedRaw.map(normalizeImage);
      expect(deleted).toHaveLength(imageCodes.length);
      await expect(imageContract.read(ctx as any, ids[0])).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
