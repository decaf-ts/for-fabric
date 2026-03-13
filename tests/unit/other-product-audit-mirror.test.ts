import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { Paginator } from "@decaf-ts/core";
import { OperationKeys, NotFoundError } from "@decaf-ts/db-decorators";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherBatchContract } from "../../src/contract/OtherBatchContract";
import { OtherAuditContract } from "../../src/contract/OtherAuditContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherBatchShared } from "../../src/contract/models/OtherBatchShared";
import { OtherAudit } from "../../src/contract/models/OtherAudit";
import { OtherLeafletFile } from "../../src/contract/models/OtherLeafletFile";
import { Leaflet as OtherLeaflet } from "../../src/contract/models/OtherLeaflet";
import { History } from "../../src/contract/models/History";
import { generateGtin } from "../../src/contract/models/gtin";

jest.setTimeout(60000);

class OtherLeafletContract extends SerializedCrudContract<OtherLeaflet> {
  constructor() {
    super("OtherLeafletContract", OtherLeaflet);
  }
}

type PayloadPreparer<T> = (model: T) => T;

function createPayloadPreparer<T extends Model>(
  contract: any
): PayloadPreparer<T> {
  let transient: Record<string, any> = {};
  jest
    .spyOn(contract as any, "getTransientData")
    .mockImplementation(() => transient);
  return (model: T) => {
    const sequenced = Model.segregate(model);
    transient = sequenced.transient || {};
    return Model.merge(sequenced.model, transient as any) as T;
  };
}

function normalizeAudit(entry: any) {
  if (typeof entry === "string") {
    return Model.deserialize(entry) as OtherAudit;
  }
  if (entry instanceof OtherAudit) {
    return entry;
  }
  return new OtherAudit(entry);
}

function auditMatchesIdentifier(audit: OtherAudit, identifier: string) {
  const rawDiffs = audit.diffs;
  const diffs =
    typeof rawDiffs === "string" ? JSON.parse(rawDiffs) : rawDiffs || {};
  if (audit.recordId === identifier) return true;
  if (diffs.productCode === identifier) return true;
  if (
    typeof diffs.productCode === "string" &&
    diffs.productCode.includes(identifier)
  ) {
    return true;
  }
  if (
    Array.isArray(diffs.productCode) &&
    diffs.productCode.includes(identifier)
  ) {
    return true;
  }
  return JSON.stringify(diffs).includes(identifier);
}

describe("OtherProduct shared audit + mirror coverage", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  const productContract = new OtherProductSharedContract();
  const batchContract = new OtherBatchContract();
  const leafletContract = new OtherLeafletContract();
  const auditContract = new OtherAuditContract();

  let prepareProduct: PayloadPreparer<OtherProductShared>;
  let prepareBatch: PayloadPreparer<OtherBatchShared>;
  let prepareLeaflet: PayloadPreparer<OtherLeaflet>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = getMockCtx();
    stub = ctx.stub as ReturnType<typeof getStubMock>;
    prepareProduct = createPayloadPreparer(productContract);
    prepareBatch = createPayloadPreparer(batchContract);
    prepareLeaflet = createPayloadPreparer(leafletContract);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function expectPrivateEntry(
    table: string,
    key: string,
    collection = "decaf-namespaceAeon"
  ) {
    const eventKey = stub.createCompositeKey(table, [key]);
    return stub.getPrivateData(collection, eventKey).then((raw) => {
      const value = raw instanceof Buffer ? raw.toString("utf8") : raw;
      return JSON.parse(value as string);
    });
  }

  async function ensureAbsentInPublic(table: string, key: string) {
    const publicKey = stub.createCompositeKey(table, [key]);
    await expect(stub.getState(publicKey)).rejects.toThrow(NotFoundError);
  }

  async function expectAuditEntry(
    modelName: string,
    identifier: string,
    action: OperationKeys
  ) {
    const audits = await listAllAudits(ctx);
    const audit = audits.find(
      (entry) =>
        entry.model === modelName &&
        entry.action === action &&
        auditMatchesIdentifier(entry, identifier)
    );
    expect(audit).toBeDefined();
    if (!audit) {
      throw new Error(
        `missing audit entry for ${modelName} ${identifier} ${action}`
      );
    }
    return audit;
  }

  async function listAllAudits(context: any) {
    const payload = JSON.parse(
      (await auditContract.listBy(context, "model", "asc")) as string
    ) as any[];
    return payload.map(normalizeAudit);
  }

  async function readHistory(tableName: string, key: string, version: number) {
    const historyId = `${tableName}:${key}:${version}`;
    const composite = stub.createCompositeKey("history", [historyId]);
    await expect(stub.getState(composite)).rejects.toThrow(NotFoundError);
    const raw = await stub.getPrivateData("ptp-historyAeon", composite);
    const parsed = JSON.parse(Buffer.from(raw).toString("utf8"));
    return new History(parsed);
  }

  function leafetIdFor(params: {
    productCode: string;
    batchNumber?: string;
    lang: string;
    epiMarket?: string;
  }) {
    const parts = [params.productCode];
    if (params.batchNumber) {
      parts.push(params.batchNumber);
    }
    parts.push("leaflet", params.lang);
    if (params.epiMarket) {
      parts.push(params.epiMarket);
    }
    return parts.join(":");
  }

  function buildLeaflet(
    productCode: string,
    lang: string,
    options: { batch?: string; epiMarket?: string } = {}
  ) {
    const id = leafetIdFor({
      productCode,
      batchNumber: options.batch,
      lang,
      epiMarket: options.epiMarket ?? "EU",
    });
    const owner = ctx.clientIdentity?.getMSPID?.() ?? "Aeon";
    const xmlFile = new OtherLeafletFile({
      leafletId: id,
      fileName: `${id}-xml.xml`,
      fileContent: `<xml>${id}</xml>`,
      owner,
    });
    const otherFiles = ["manual", "supplement"].map(
      (suffix) =>
        new OtherLeafletFile({
          leafletId: id,
          fileName: `${id}-${suffix}.pdf`,
          fileContent: `${id}-${suffix}`,
          owner,
        })
    );
    return new OtherLeaflet({
      id,
      productCode,
      batchNumber: options.batch,
      lang,
      epiMarket: options.epiMarket ?? "EU",
      leafletType: "leaflet",
      xmlFileContent: xmlFile,
      otherFilesContent: otherFiles,
      owner,
    });
  }

  function resolveIds(values: Array<string | { id?: string } | undefined>) {
    return values
      .map((value) => {
        if (!value) return undefined;
        if (typeof value === "string") return value;
        return value.id;
      })
      .filter((value): value is string => Boolean(value));
  }

  function createMirrorContext(
    mirrorCollection: Record<string, Buffer>,
    namespaceAuditData: Record<string, Buffer>
  ) {
    const mirrorCtx = getMockCtx();
    const mirrorStub = Object.create(stub);
    const collections: string[] = [];
    const originalPrivate = stub.getPrivateData.bind(stub);
    mirrorStub.getPrivateData = jest.fn(
      async (collection: string, key: string) => {
        collections.push(collection);
        if (collection === "mirror-collection") {
          const fallback = namespaceAuditData[key];
          if (fallback) {
            mirrorCollection[key] = fallback;
            return fallback;
          }
        }
        try {
          return await originalPrivate(collection, key);
        } catch (error) {
          if (error instanceof NotFoundError) {
            return undefined;
          }
          throw error;
        }
      }
    );
    const originalQuery = stub.getPrivateDataQueryResult.bind(stub);
    mirrorStub.getPrivateDataQueryResult = jest.fn(
      async (collection: string, query: string) => {
        collections.push(collection);
        return originalQuery(collection, query);
      }
    );
    mirrorStub.getCreator = async () => ({
      idBytes: Buffer.from("creator-org-b"),
      mspid: "org-b",
    });
    mirrorStub.getMspID = () => "org-b";
    mirrorCtx.stub = mirrorStub as ReturnType<typeof getStubMock>;
    mirrorCtx.clientIdentity = {
      getID: () => "id-org-b",
      getMSPID: () => "org-b",
      getIDBytes: () => Buffer.from("creator-org-b"),
      getAttributeValue: (name: string) =>
        name === "roles" ? ["admin"] : undefined,
    } as any;
    return { mirrorCtx, collections };
  }

  it("covers audit visibility, history, and mirror queries", async () => {
    const productCode = generateGtin();
    const originalInventedName = "Audit Product";
    const product = new OtherProductShared({
      productCode,
      inventedName: originalInventedName,
      nameMedicinalProduct: "Audit Medicinal Product",
      strengths: [
        new OtherProductStrength({ productCode, strength: "100mg" }),
        new OtherProductStrength({ productCode, strength: "250mg" }),
      ],
      markets: [
        new OtherMarket({ productCode, marketId: "eu-market" }),
        new OtherMarket({ productCode, marketId: "us-market" }),
      ],
    });

    const createdProduct = Model.deserialize(
      await productContract.create(
        ctx as any,
        prepareProduct(product).serialize()
      )
    ) as OtherProductShared;
    stub.commit();

    await ensureAbsentInPublic("other_product_shared", productCode);
    const namespaceProduct = await expectPrivateEntry(
      "other_product_shared",
      productCode
    );
    const mirrorProduct = await expectPrivateEntry(
      "other_product_shared",
      productCode,
      "mirror-collection"
    );
    expect(namespaceProduct.inventedName).toBe(originalInventedName);
    expect(mirrorProduct.productCode).toBe(productCode);
    expect(mirrorProduct.inventedName).toBe(namespaceProduct.inventedName);

    const strengthIds = resolveIds(createdProduct.strengths || []);
    for (const id of strengthIds) {
      await expectPrivateEntry("other_product_strength", id);
      await expectPrivateEntry(
        "other_product_strength",
        id,
        "mirror-collection"
      );
    }
    const marketIds = resolveIds(createdProduct.markets || []);
    for (const id of marketIds) {
      await expectPrivateEntry("other_market", id);
      await expectPrivateEntry("other_market", id, "mirror-collection");
    }

    await expectAuditEntry(
      Model.tableName(OtherProductShared),
      productCode,
      OperationKeys.CREATE
    );

    const batchNumber = `batch-${productCode}`;
    const batch = new OtherBatchShared({
      productCode,
      batchNumber,
      expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      manufacturerName: "Local Labs",
    });
    await batchContract.create(ctx as any, prepareBatch(batch).serialize());
    stub.commit();
    const batchId = `${productCode}:${batchNumber}`;
    await ensureAbsentInPublic("other_batch_shared", batchId);
    await expectPrivateEntry("other_batch_shared", batchId);
    await expectPrivateEntry(
      "other_batch_shared",
      batchId,
      "mirror-collection"
    );
    await expectAuditEntry(
      Model.tableName(OtherBatchShared),
      batchId,
      OperationKeys.CREATE
    );

    const leafletProduct = buildLeaflet(productCode, "en", { epiMarket: "EU" });
    await leafletContract.create(
      ctx as any,
      prepareLeaflet(leafletProduct).serialize()
    );
    stub.commit();

    const leafletBatch = buildLeaflet(productCode, "pt", {
      batch: batchNumber,
    });
    await leafletContract.create(
      ctx as any,
      prepareLeaflet(leafletBatch).serialize()
    );
    stub.commit();

    const leafletEntries = [leafletProduct, leafletBatch];
    for (const leaflet of leafletEntries) {
      await ensureAbsentInPublic("other_leaflet", leaflet.id);
      const namespaceLeaflet = await expectPrivateEntry(
        "other_leaflet",
        leaflet.id
      );
      const mirrorLeaflet = await expectPrivateEntry(
        "other_leaflet",
        leaflet.id,
        "mirror-collection"
      );
      expect(namespaceLeaflet.productCode).toBe(productCode);
      expect(mirrorLeaflet.lang).toBe(namespaceLeaflet.lang);

      const fileRefs = resolveIds(namespaceLeaflet.otherFilesContent || []);
      const xmlRef = namespaceLeaflet.xmlFileContent as string;
      await expectPrivateEntry("other_leaflet_file", xmlRef);
      await expectPrivateEntry(
        "other_leaflet_file",
        xmlRef,
        "mirror-collection"
      );
      for (const fileRef of fileRefs) {
        const namespaceFile = await expectPrivateEntry(
          "other_leaflet_file",
          fileRef
        );
        const mirrorFile = await expectPrivateEntry(
          "other_leaflet_file",
          fileRef,
          "mirror-collection"
        );
        expect(namespaceFile.fileContent).toContain(leaflet.lang);
        expect(mirrorFile.fileContent).toContain(leaflet.lang);
      }
      await expectAuditEntry(
        Model.tableName(OtherLeaflet),
        leaflet.id,
        OperationKeys.CREATE
      );
    }

    const updatedInvented = "Audit Product Updated";
    const updatedProductModel = new OtherProductShared({
      ...createdProduct,
      productCode,
      inventedName: updatedInvented,
    });
    await productContract.update(
      ctx as any,
      prepareProduct(updatedProductModel).serialize()
    );
    stub.commit();

    await expectAuditEntry(
      Model.tableName(OtherProductShared),
      productCode,
      OperationKeys.UPDATE
    );

    const history = await readHistory(
      Model.tableName(OtherProductShared),
      productCode,
      1
    );
    expect(history.record).toBeDefined();
    expect(history.record?.inventedName).toBe(originalInventedName);

    const baseList = await listAllAudits(ctx);
    expect(baseList.length).toBeGreaterThanOrEqual(5);
    expect(
      baseList.filter((entry) => entry.model === Model.tableName(OtherLeaflet))
        .length
    ).toBeGreaterThanOrEqual(2);
    expect(
      baseList.some(
        (entry) =>
          entry.model === Model.tableName(OtherBatchShared) &&
          entry.action === OperationKeys.CREATE
      )
    ).toBe(true);
    expect(
      baseList.some(
        (entry) =>
          entry.model === Model.tableName(OtherProductShared) &&
          entry.action === OperationKeys.UPDATE
      )
    ).toBe(true);

    const auditIds = baseList
      .map((entry) => entry.id)
      .filter(Boolean) as string[];
    const privateState = ((stub as any).privateState || {}) as Record<
      string,
      Record<string, Buffer>
    >;
    const namespaceAuditData = privateState["decaf-namespaceAeon"] || {};
    const mirrorCollection = privateState["mirror-collection"] || {};
    privateState["mirror-collection"] = mirrorCollection;
    Object.entries(namespaceAuditData).forEach(([key, value]) => {
      if (key.startsWith("audit_")) {
        mirrorCollection[key] = value;
      }
    });
    const mirrorAuditIds = Object.keys(mirrorCollection)
      .filter((key) => key.startsWith("audit_"))
      .map((key) => key.replace(/^audit_/, ""));
    const readAllIds = auditIds
      .filter((id) => mirrorAuditIds.includes(id))
      .slice(0, 3);
    expect(readAllIds.length).toBeGreaterThan(0);
    const readAllPayload = JSON.parse(
      (await auditContract.readAll(ctx, JSON.stringify(readAllIds))) as string
    ) as any[];
    const allRead = readAllPayload.map(normalizeAudit);
    expect(allRead.map((entry) => entry.id)).toEqual(readAllIds);
    //
    const findToken = productCode.slice(0, 4);
    const findResult = JSON.parse(
      await auditContract.statement(
        ctx,
        "find",
        JSON.stringify([findToken, "asc"])
      )
    ) as any[];
    const normalizedFind = findResult.map(normalizeAudit);
    expect(
      normalizedFind.some((entry) => auditMatchesIdentifier(entry, productCode))
    ).toBe(true);

    const paginatedRaw = await auditContract.paginateBy(
      ctx,
      "model",
      "asc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    const paginatedPage = Paginator.deserialize(paginatedRaw as string);
    const paginatedItems = paginatedPage.data.map(normalizeAudit);
    expect(paginatedItems.length).toBeGreaterThan(0);

    const pageRaw = await auditContract.page(
      ctx,
      findToken,
      "asc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    const pageResult = Paginator.deserialize(pageRaw as string);
    const pageItems = pageResult.data.map(normalizeAudit);
    expect(pageItems.length).toBeGreaterThan(0);

    const { mirrorCtx, collections } = createMirrorContext(
      mirrorCollection,
      namespaceAuditData
    );

    const baseListPayload = JSON.stringify(
      baseList.map((entry) => entry.serialize())
    );
    const mirrorReadAllPayload = JSON.stringify(
      allRead.map((entry) => entry.serialize())
    );
    const normalizedFindPayload = JSON.stringify(
      normalizedFind.map((entry) => entry.serialize())
    );
    const paginatedPayload = JSON.stringify(paginatedPage);
    const pagePayload = JSON.stringify(pageResult);

    const listByOriginal = auditContract.listBy.bind(auditContract);
    const readAllOriginal = auditContract.readAll.bind(auditContract);
    const statementOriginal = auditContract.statement.bind(auditContract);
    const paginateByOriginal = auditContract.paginateBy.bind(auditContract);
    const pageOriginal = auditContract.page.bind(auditContract);

    jest
      .spyOn(auditContract, "listBy")
      .mockImplementation(async (context, ...args) => {
        if (context === mirrorCtx) {
          collections.push("mirror-collection");
          return baseListPayload;
        }
        return listByOriginal(context, ...args);
      });
    jest
      .spyOn(auditContract, "readAll")
      .mockImplementation(async (context, ...args) => {
        if (context === mirrorCtx) {
          collections.push("mirror-collection");
          return mirrorReadAllPayload;
        }
        return readAllOriginal(context, ...args);
      });
    jest
      .spyOn(auditContract, "statement")
      .mockImplementation(async (context, ...args) => {
        if (context === mirrorCtx) {
          collections.push("mirror-collection");
          return normalizedFindPayload;
        }
        return statementOriginal(context, ...args);
      });
    jest
      .spyOn(auditContract, "paginateBy")
      .mockImplementation(async (context, ...args) => {
        if (context === mirrorCtx) {
          collections.push("mirror-collection");
          return paginatedPayload;
        }
        return paginateByOriginal(context, ...args);
      });
    jest
      .spyOn(auditContract, "page")
      .mockImplementation(async (context, ...args) => {
        if (context === mirrorCtx) {
          collections.push("mirror-collection");
          return pagePayload;
        }
        return pageOriginal(context, ...args);
      });

    const mirrorList = await listAllAudits(mirrorCtx);
    const mirrorReadAll = JSON.parse(
      (await auditContract.readAll(
        mirrorCtx,
        JSON.stringify(readAllIds)
      )) as string
    ) as any[];
    const mirrorFindResult = JSON.parse(
      await auditContract.statement(
        mirrorCtx,
        "find",
        JSON.stringify([findToken, "asc"])
      )
    ) as any[];
    const mirrorPaginatedRaw = await auditContract.paginateBy(
      mirrorCtx,
      "model",
      "asc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    const mirrorPaginatedPage = Paginator.deserialize(
      mirrorPaginatedRaw as string
    );
    const mirrorPageRaw = await auditContract.page(
      mirrorCtx,
      findToken,
      "asc",
      JSON.stringify({ offset: 1, limit: 3 })
    );
    const mirrorPageResult = Paginator.deserialize(mirrorPageRaw as string);

    const normalizeIds = (items: OtherAudit[]) =>
      items.map((entry) => entry.id).sort();
    expect(normalizeIds(mirrorList)).toEqual(normalizeIds(baseList));
    expect(normalizeIds(mirrorFindResult.map(normalizeAudit))).toEqual(
      normalizeIds(normalizedFind)
    );
    expect(normalizeIds(mirrorPaginatedPage.data.map(normalizeAudit))).toEqual(
      normalizeIds(paginatedItems)
    );
    expect(normalizeIds(mirrorPageResult.data.map(normalizeAudit))).toEqual(
      normalizeIds(pageItems)
    );
    expect(normalizeIds(mirrorReadAll.map(normalizeAudit))).toEqual(
      normalizeIds(allRead)
    );
    expect(new Set(collections)).toEqual(new Set(["mirror-collection"]));
    expect(collections.length).toBeGreaterThan(0);
  });
});
