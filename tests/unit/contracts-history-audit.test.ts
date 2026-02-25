import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { History } from "../../src/contract/models/History";
import { NotFoundError } from "@decaf-ts/db-decorators";

jest.setTimeout(60000);

describe("History decorator — relation population & audit comparison", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    stub = getStubMock();
    ctx = getMockCtx();
    Object.assign(ctx, { stub });
    contract = new OtherProductSharedContract();
  });

  function buildStrength(productCode: string, strength: string) {
    return new OtherProductStrength({ productCode, strength });
  }

  function buildMarket(productCode: string, marketId: string) {
    return new OtherMarket({ productCode, marketId });
  }

  function preparePayload(model: OtherProductShared) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};
    transientSpy.mockImplementation(() => transient);
    return segregated.model;
  }

  /**
   * Reads a History entry from the ptp-historyAeon shared collection.
   * The history id is composed as "<table>:<pk>:<version>".
   */
  async function loadHistory(
    productCode: string,
    version: number
  ): Promise<History> {
    const historyId = `other_product_shared:${productCode}:${version}`;
    const k = stub.createCompositeKey("history", [historyId]);
    const raw = await stub.getPrivateData("ptp-historyAeon", k);
    return new History(JSON.parse(Buffer.from(raw).toString("utf8")));
  }

  /**
   * Reads OtherProductShared from the shared private collection.
   */
  async function loadProduct(productCode: string): Promise<OtherProductShared> {
    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    const raw = await stub.getPrivateData("decaf-namespaceAeon", k);
    return new OtherProductShared(JSON.parse(raw.toString()));
  }

  /**
   * Finds all audit entries stored in decaf-namespaceAeon for the given action.
   */
  function scanAuditEntries(action: string): any[] {
    const col = (stub as any).privateState?.["decaf-namespaceAeon"] ?? {};
    return Object.entries(col)
      .filter(([key]) => key.startsWith("audit_"))
      .map(([, val]: [string, any]) => {
        const entry = JSON.parse(Buffer.from(val).toString("utf8"));
        // diffs is stored as a JSON string via @serialize() — parse it back
        if (typeof entry.diffs === "string") {
          try {
            entry.diffs = JSON.parse(entry.diffs);
          } catch {
            // leave as string if parsing fails
          }
        }
        return entry;
      })
      .filter((entry: any) => entry.action === action);
  }

  // ─── Describe: history on update stores fully populated relations ──────────

  describe("history on update — populated relations", () => {
    let productCode: string;

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates a product WITH strengths and markets, commit", async () => {
      productCode = generateGtin();
      const model = new OtherProductShared({
        productCode,
        inventedName: "History Test Product",
        nameMedicinalProduct: "TestMed",
        strengths: [buildStrength(productCode, "100mg")],
        markets: [buildMarket(productCode, "us")],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();

      const product = await loadProduct(productCode);
      expect(product.hasErrors()).toBeUndefined();
      expect(product.counter).toBe(1);

      // Strengths and markets should be created and stored
      const strengthIds = product.strengths as string[];
      expect(strengthIds.length).toBe(1);
    });

    it("updates the product (triggers history for v1), commit", async () => {
      const product = await loadProduct(productCode);

      const updated = new OtherProductShared({
        ...product,
        inventedName: "History Test Product Updated",
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();

      const product2 = await loadProduct(productCode);
      expect(product2.counter).toBe(2);
      expect(product2.inventedName).toBe("History Test Product Updated");
    });

    it("history v1 exists and has fully populated strengths and markets", async () => {
      const history = await loadHistory(productCode, 1);
      expect(history.hasErrors()).toBeUndefined();
      expect(history.table).toBe("other_product_shared");
      expect(history.key).toBe(productCode);
      expect(history.version).toBe(1);

      const record = history.record as any;
      expect(record).toBeDefined();
      expect(record.productCode).toBe(productCode);
      expect(record.inventedName).toBe("History Test Product");

      // Strengths must be populated objects, not bare IDs
      expect(Array.isArray(record.strengths)).toBe(true);
      expect(record.strengths.length).toBe(1);
      const strength = record.strengths[0];
      expect(typeof strength).toBe("object");
      expect(strength.strength).toBe("100mg");
      expect(strength.productCode).toBe(productCode);

      // Markets must be populated objects
      expect(Array.isArray(record.markets)).toBe(true);
      expect(record.markets.length).toBe(1);
      const market = record.markets[0];
      expect(typeof market).toBe("object");
      expect(market.marketId).toBe("us");
      expect(market.productCode).toBe(productCode);
    });

    it("second update (add more relations) triggers history for v2", async () => {
      const product = await loadProduct(productCode);

      // Cast strengths/markets — after populate=true they are objects
      const existing = product as any;
      const strengthIds: string[] = (existing.strengths || []).map((s: any) =>
        typeof s === "object" ? s.id : s
      );
      const marketIds: string[] = (existing.markets || []).map((m: any) =>
        typeof m === "object" ? m.id : m
      );

      const updated = new OtherProductShared({
        ...product,
        strengths: [
          ...strengthIds.map((id) => ({ id })),
          buildStrength(productCode, "200mg"),
        ] as any,
        markets: [
          ...marketIds.map((id) => ({ id })),
          buildMarket(productCode, "eu"),
        ] as any,
        inventedName: "History Test Product v3",
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();

      const product3 = await loadProduct(productCode);
      expect(product3.counter).toBe(3);
    });

    it("history v2 has 1 strength and 1 market (snapshot of v2 state)", async () => {
      const history = await loadHistory(productCode, 2);
      expect(history.version).toBe(2);

      const record = history.record as any;
      expect(record.inventedName).toBe("History Test Product Updated");

      // Strengths populated
      expect(Array.isArray(record.strengths)).toBe(true);
      expect(record.strengths.length).toBe(1);
      expect(typeof record.strengths[0]).toBe("object");
      expect(record.strengths[0].strength).toBe("100mg");

      // Markets populated
      expect(Array.isArray(record.markets)).toBe(true);
      expect(record.markets.length).toBe(1);
      expect(typeof record.markets[0]).toBe("object");
      expect(record.markets[0].marketId).toBe("us");
    });
  });

  // ─── Describe: history on delete stores fully populated relations ──────────

  describe("history on delete — populated relations", () => {
    let productCode: string;
    let versionAtDelete: number;

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates a product with relations, commits", async () => {
      productCode = generateGtin();
      const model = new OtherProductShared({
        productCode,
        inventedName: "Delete History Product",
        nameMedicinalProduct: "DeleteMed",
        strengths: [
          buildStrength(productCode, "250mg"),
          buildStrength(productCode, "500mg"),
        ],
        markets: [buildMarket(productCode, "de")],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();

      const product = await loadProduct(productCode);
      expect(product.counter).toBe(1);
      versionAtDelete = product.counter as number;
    });

    it("deletes the product, commits", async () => {
      await contract.delete(ctx as any, productCode);
      stub.commit();

      const k = stub.createCompositeKey("other_product_shared", [productCode]);
      await expect(
        stub.getPrivateData("decaf-namespaceAeon", k)
      ).rejects.toThrow(NotFoundError);
    });

    it("history entry for deleted version has fully populated relations", async () => {
      const history = await loadHistory(productCode, versionAtDelete);
      expect(history.hasErrors()).toBeUndefined();
      expect(history.table).toBe("other_product_shared");
      expect(history.key).toBe(productCode);
      expect(history.version).toBe(versionAtDelete);

      const record = history.record as any;
      expect(record.inventedName).toBe("Delete History Product");

      // Strengths populated
      expect(Array.isArray(record.strengths)).toBe(true);
      expect(record.strengths.length).toBe(2);
      for (const s of record.strengths) {
        expect(typeof s).toBe("object");
        expect(s.productCode).toBe(productCode);
        expect(typeof s.strength).toBe("string");
      }
      const strengthValues = record.strengths.map((s: any) => s.strength);
      expect(strengthValues).toContain("250mg");
      expect(strengthValues).toContain("500mg");

      // Markets populated
      expect(Array.isArray(record.markets)).toBe(true);
      expect(record.markets.length).toBe(1);
      expect(typeof record.markets[0]).toBe("object");
      expect(record.markets[0].marketId).toBe("de");
    });
  });

  // ─── Describe: history on sub-model update (OtherProductStrength) ─────────

  describe("history on OtherProductStrength update — own handler", () => {
    let productCode: string;
    let strengthId: string;

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates a product with a strength, commits", async () => {
      productCode = generateGtin();
      const model = new OtherProductShared({
        productCode,
        inventedName: "Strength History Product",
        nameMedicinalProduct: "StrMed",
        strengths: [buildStrength(productCode, "50mg")],
        markets: [],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();

      const product = await loadProduct(productCode);
      // strengths are stored as IDs in private collection
      const rawStrengths = product.strengths as any[];
      expect(rawStrengths.length).toBe(1);
      strengthId =
        typeof rawStrengths[0] === "object"
          ? rawStrengths[0].id
          : rawStrengths[0];
    });

    it("updates the product (modifying strength via cascade), commits", async () => {
      const product = await loadProduct(productCode);
      const rawStrengths = (product.strengths || []) as any[];
      const strengthIds = rawStrengths.map((s: any) =>
        typeof s === "object" ? s.id : s
      );

      const updated = new OtherProductShared({
        ...product,
        strengths: strengthIds.map((id: string) => ({
          id,
          productCode,
          strength: "75mg", // changed
        })) as any,
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();
    });

    it("history entry for strength v1 exists with correct data", async () => {
      // OtherProductStrength also has @historyDec() on its pk
      const historyId = `product_strength:${strengthId}:1`;
      const k = stub.createCompositeKey("history", [historyId]);
      const raw = await stub.getPrivateData("ptp-historyAeon", k);
      const history = new History(
        JSON.parse(Buffer.from(raw).toString("utf8"))
      );
      expect(history.hasErrors()).toBeUndefined();
      expect(history.version).toBe(1);
      expect(history.table).toBe("product_strength");

      const record = history.record as any;
      expect(record.strength).toBe("50mg");
    });
  });

  // ─── Describe: audit comparison accuracy with populated relations ──────────

  describe("audit — accurate diffs with populated relations", () => {
    let productCode: string;

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates a product with strengths (audit CREATE stored)", async () => {
      productCode = generateGtin();
      const model = new OtherProductShared({
        productCode,
        inventedName: "Audit Test Product",
        nameMedicinalProduct: "AuditMed",
        strengths: [buildStrength(productCode, "10mg")],
        markets: [buildMarket(productCode, "fr")],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();
    });

    it("updates only inventedName — diffs should NOT show strengths/markets changed", async () => {
      const product = await loadProduct(productCode);

      // Keep same relations, only change inventedName
      const rawStrengths = (product.strengths || []) as any[];
      const strengthIds = rawStrengths.map((s: any) =>
        typeof s === "object" ? s.id : s
      );
      const rawMarkets = (product.markets || []) as any[];
      const marketIds = rawMarkets.map((m: any) =>
        typeof m === "object" ? m.id : m
      );

      const updated = new OtherProductShared({
        ...product,
        inventedName: "Audit Test Product RENAMED",
        strengths: strengthIds.map((id: string) => ({ id })) as any,
        markets: marketIds.map((id: string) => ({ id })) as any,
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();
    });

    it("audit UPDATE entry shows only inventedName in diffs, not strengths/markets", async () => {
      const updateAudits = scanAuditEntries("update");
      const productAudits = updateAudits.filter(
        (a: any) => a.model === "other_product_shared"
      );
      expect(productAudits.length).toBeGreaterThan(0);

      const lastAudit = productAudits[productAudits.length - 1];
      const diffs = lastAudit.diffs || {};
      console.log("DEBUG audit diffs:", JSON.stringify(diffs, null, 2));

      // inventedName changed → should appear in diffs
      expect(diffs.inventedName).toBeDefined();
      expect(diffs.inventedName.current).toBe("Audit Test Product RENAMED");
      expect(diffs.inventedName.other).toBe("Audit Test Product");

      // strengths and markets did NOT change → should NOT appear in diffs
      // (With relation population, comparing populated vs populated gives no spurious diff)
      expect(diffs.strengths).toBeUndefined();
      expect(diffs.markets).toBeUndefined();
    });

    it("updates and adds a new strength — diffs reflect the actual addition", async () => {
      const product = await loadProduct(productCode);

      const rawStrengths = (product.strengths || []) as any[];
      const strengthIds = rawStrengths.map((s: any) =>
        typeof s === "object" ? s.id : s
      );
      const rawMarkets = (product.markets || []) as any[];
      const marketIds = rawMarkets.map((m: any) =>
        typeof m === "object" ? m.id : m
      );

      const updated = new OtherProductShared({
        ...product,
        strengths: [
          ...strengthIds.map((id: string) => ({ id })),
          buildStrength(productCode, "20mg"),
        ] as any,
        markets: marketIds.map((id: string) => ({ id })) as any,
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();

      const product3 = await loadProduct(productCode);
      const finalStrengths = (product3.strengths || []) as any[];
      expect(finalStrengths.length).toBe(2);
    });

    it("audit entry for strength addition shows strengths changed (length 1→2)", async () => {
      const updateAudits = scanAuditEntries("update");
      const productAudits = updateAudits.filter(
        (a: any) => a.model === "other_product_shared"
      );
      expect(productAudits.length).toBeGreaterThanOrEqual(2);

      // The most recent audit is for the strength addition
      const lastAudit = productAudits[productAudits.length - 1];
      const diffs = lastAudit.diffs || {};

      // strengths changed (length 1 → 2) → must appear in diffs
      expect(diffs.strengths).toBeDefined();

      // markets unchanged → must NOT appear in diffs
      expect(diffs.markets).toBeUndefined();

      // inventedName unchanged → must NOT appear in diffs
      expect(diffs.inventedName).toBeUndefined();
    });
  });

  // ─── Describe: multiple updates produce sequential history entries ─────────

  describe("multiple updates produce sequential history entries", () => {
    let productCode: string;

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates v1 with relations, updates twice, has history for v1 and v2", async () => {
      productCode = generateGtin();

      // Create
      const model = new OtherProductShared({
        productCode,
        inventedName: "Multi Version Product",
        nameMedicinalProduct: "MultiMed",
        strengths: [buildStrength(productCode, "5mg")],
        markets: [buildMarket(productCode, "ca")],
      });
      await contract.create(ctx as any, preparePayload(model).serialize());
      stub.commit();

      // First update → stores history of v1
      const v1 = await loadProduct(productCode);
      const v1StrengthIds = ((v1.strengths || []) as any[]).map((s: any) =>
        typeof s === "object" ? s.id : s
      );
      const v1MarketIds = ((v1.markets || []) as any[]).map((m: any) =>
        typeof m === "object" ? m.id : m
      );

      const update1 = new OtherProductShared({
        ...v1,
        inventedName: "Multi Version Product v2",
        strengths: v1StrengthIds.map((id: string) => ({ id })) as any,
        markets: v1MarketIds.map((id: string) => ({ id })) as any,
      });
      await contract.update(ctx as any, preparePayload(update1).serialize());
      stub.commit();

      // Second update → stores history of v2
      const v2 = await loadProduct(productCode);
      const v2StrengthIds = ((v2.strengths || []) as any[]).map((s: any) =>
        typeof s === "object" ? s.id : s
      );
      const v2MarketIds = ((v2.markets || []) as any[]).map((m: any) =>
        typeof m === "object" ? m.id : m
      );

      const update2 = new OtherProductShared({
        ...v2,
        inventedName: "Multi Version Product v3",
        strengths: [
          ...v2StrengthIds.map((id: string) => ({ id })),
          buildStrength(productCode, "10mg"),
        ] as any,
        markets: v2MarketIds.map((id: string) => ({ id })) as any,
      });
      await contract.update(ctx as any, preparePayload(update2).serialize());
      stub.commit();

      // Verify history v1 — snapshot of v1 state
      const hist1 = await loadHistory(productCode, 1);
      expect(hist1.version).toBe(1);
      const rec1 = hist1.record as any;
      expect(rec1.inventedName).toBe("Multi Version Product");
      expect(Array.isArray(rec1.strengths)).toBe(true);
      expect(rec1.strengths.length).toBe(1);
      expect(typeof rec1.strengths[0]).toBe("object");
      expect(rec1.strengths[0].strength).toBe("5mg");
      expect(Array.isArray(rec1.markets)).toBe(true);
      expect(rec1.markets.length).toBe(1);
      expect(typeof rec1.markets[0]).toBe("object");
      expect(rec1.markets[0].marketId).toBe("ca");

      // Verify history v2 — snapshot of v2 state (1 strength "5mg", 1 market "ca")
      const hist2 = await loadHistory(productCode, 2);
      expect(hist2.version).toBe(2);
      const rec2 = hist2.record as any;
      expect(rec2.inventedName).toBe("Multi Version Product v2");
      expect(Array.isArray(rec2.strengths)).toBe(true);
      expect(rec2.strengths.length).toBe(1);
      expect(typeof rec2.strengths[0]).toBe("object");
      expect(Array.isArray(rec2.markets)).toBe(true);
      expect(rec2.markets.length).toBe(1);
      expect(typeof rec2.markets[0]).toBe("object");
    });

    it("no history entry exists for v3 (update not yet applied)", async () => {
      // After the second update, counter is now 3 — no further update was done
      // so there is no history record for v3 yet
      const historyId = `other_product_shared:${productCode}:3`;
      const k = stub.createCompositeKey("history", [historyId]);
      await expect(stub.getPrivateData("ptp-historyAeon", k)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ─── Describe: history mirror — written to ptp-history-mirror ─────────────

  describe("history mirror — record written to ptp-history-mirror", () => {
    let productCode: string;

    /**
     * Reads a History entry from the ptp-history-mirror collection.
     */
    async function loadHistoryMirror(
      pc: string,
      version: number
    ): Promise<History> {
      const historyId = `other_product_shared:${pc}:${version}`;
      const k = stub.createCompositeKey("history", [historyId]);
      const raw = await stub.getPrivateData("ptp-history-mirror", k);
      return new History(JSON.parse(Buffer.from(raw).toString("utf8")));
    }

    beforeEach(() => {
      ctx = getMockCtx();
      Object.assign(ctx, { stub });
      transientSpy = jest.spyOn(contract as any, "getTransientData");
    });

    afterEach(() => jest.restoreAllMocks());

    it("creates a product with relations, commits", async () => {
      productCode = generateGtin();
      const model = new OtherProductShared({
        productCode,
        inventedName: "Mirror History Product",
        nameMedicinalProduct: "MirrorMed",
        strengths: [buildStrength(productCode, "30mg")],
        markets: [buildMarket(productCode, "jp")],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();
    });

    it("updates the product — history v1 written to both collections", async () => {
      const product = await loadProduct(productCode);

      const updated = new OtherProductShared({
        ...product,
        inventedName: "Mirror History Product UPDATED",
      });

      const payload = preparePayload(updated);
      await contract.update(ctx as any, payload.serialize());
      stub.commit();

      // Primary collection must have the history record
      const main = await loadHistory(productCode, 1);
      expect(main.hasErrors()).toBeUndefined();
      expect(main.version).toBe(1);

      // Mirror collection must have an identical copy
      const mirrored = await loadHistoryMirror(productCode, 1);
      expect(mirrored.hasErrors()).toBeUndefined();
      expect(mirrored.table).toBe("other_product_shared");
      expect(mirrored.key).toBe(productCode);
      expect(mirrored.version).toBe(1);

      // Snapshot content must match
      const mainRec = main.record as any;
      const mirrorRec = mirrored.record as any;
      expect(mirrorRec.inventedName).toBe(mainRec.inventedName);
      expect(mirrorRec.productCode).toBe(mainRec.productCode);

      // Relations must be populated in the mirror copy too
      expect(Array.isArray(mirrorRec.strengths)).toBe(true);
      expect(mirrorRec.strengths.length).toBe(1);
      expect(typeof mirrorRec.strengths[0]).toBe("object");
      expect(mirrorRec.strengths[0].strength).toBe("30mg");

      expect(Array.isArray(mirrorRec.markets)).toBe(true);
      expect(mirrorRec.markets.length).toBe(1);
      expect(typeof mirrorRec.markets[0]).toBe("object");
      expect(mirrorRec.markets[0].marketId).toBe("jp");
    });

    it("deletes the product — history entry written to both collections", async () => {
      const product = await loadProduct(productCode);
      const versionAtDelete = product.counter as number;

      await contract.delete(ctx as any, productCode);
      stub.commit();

      // Primary collection
      const main = await loadHistory(productCode, versionAtDelete);
      expect(main.hasErrors()).toBeUndefined();
      expect(main.version).toBe(versionAtDelete);

      // Mirror collection
      const mirrored = await loadHistoryMirror(productCode, versionAtDelete);
      expect(mirrored.hasErrors()).toBeUndefined();
      expect(mirrored.table).toBe("other_product_shared");
      expect(mirrored.key).toBe(productCode);
      expect(mirrored.version).toBe(versionAtDelete);

      const mirrorRec = mirrored.record as any;
      expect(mirrorRec.inventedName).toBe("Mirror History Product UPDATED");

      // Relations populated in the mirror copy
      expect(Array.isArray(mirrorRec.strengths)).toBe(true);
      expect(mirrorRec.strengths.length).toBe(1);
      expect(typeof mirrorRec.strengths[0]).toBe("object");
    });

    it("mirror entry absent when no update has occurred", async () => {
      // Create a fresh product — no update → no history → nothing in mirror
      const freshCode = generateGtin();
      const model = new OtherProductShared({
        productCode: freshCode,
        inventedName: "No History Yet",
        nameMedicinalProduct: "NHY",
        strengths: [],
        markets: [],
      });

      const payload = preparePayload(model);
      await contract.create(ctx as any, payload.serialize());
      stub.commit();

      const historyId = `other_product_shared:${freshCode}:1`;
      const k = stub.createCompositeKey("history", [historyId]);
      await expect(
        stub.getPrivateData("ptp-history-mirror", k)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
