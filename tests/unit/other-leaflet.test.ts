import "../../src/shared/overrides";
import { AuthorizationError, NotFoundError } from "@decaf-ts/db-decorators";
import { OrderDirection } from "@decaf-ts/core";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { getMockCtx, getStubMock } from "./ContextMock";
import { Leaflet as OtherLeaflet } from "../../src/contract/models/OtherLeaflet";
import { OtherLeafletFile } from "../../src/contract/models/OtherLeafletFile";
import { generateGtin } from "../../src/contract/models/gtin";

jest.setTimeout(30000);

class OtherLeafletContract extends SerializedCrudContract<OtherLeaflet> {
  constructor() {
    super("OtherLeafletContract", OtherLeaflet);
  }
}

describe("OtherLeaflet relations and mirror enforcement", () => {
  let ctx = getMockCtx();
  let stub = ctx.stub as ReturnType<typeof getStubMock>;
  const contract = new OtherLeafletContract();

  function resetCtx() {
    ctx = getMockCtx();
    stub = ctx.stub as ReturnType<typeof getStubMock>;
    Object.assign(ctx, { stub });
  }

  function ensureCommitted() {
    stub.commit();
  }

  function parseLeaflet(entry: any) {
    return typeof entry === "string" ? JSON.parse(entry) : entry;
  }

  function buildLeaflet(productCode: string, lang: string, epiMarket = "EU") {
    const batchNumber = `batch-${productCode}`;
    const leafletType = "leaflet";
    const id = composeLeafletId({
      productCode,
      batchNumber,
      leafletType,
      lang,
      epiMarket,
    });
    const xmlFile = new OtherLeafletFile({
      fileName: `${productCode}-xml.xml`,
      fileContent: `<xml>${productCode}</xml>`,
      leafletId: id,
    });
    const otherFiles = [
      new OtherLeafletFile({
        fileName: `${productCode}-manual.pdf`,
        fileContent: `${productCode}-manual`,
        leafletId: id,
      }),
      new OtherLeafletFile({
        fileName: `${productCode}-supp.pdf`,
        fileContent: `${productCode}-supplement`,
        leafletId: id,
      }),
    ];
    return new OtherLeaflet({
      id,
      productCode,
      batchNumber,
      leafletType,
      lang,
      epiMarket,
      xmlFileContent: xmlFile,
      otherFilesContent: otherFiles,
    });
  }

  function buildLeafletWithoutOptional(
    productCode: string,
    lang: string,
    options: { leafletType?: string } = {}
  ) {
    const leafletType = options.leafletType ?? "leaflet";
    const id = composeLeafletId({
      productCode,
      batchNumber: undefined,
      leafletType,
      lang,
      epiMarket: undefined,
    });
    const xmlFile = new OtherLeafletFile({
      leafletId: id,
      fileName: `${productCode}-xml.xml`,
      fileContent: `<xml>${productCode}</xml>`,
    });
    const otherFiles = ["manual", "supplement"].map(
      (suffix) =>
        new OtherLeafletFile({
          leafletId: id,
          fileName: `${productCode}-${suffix}.pdf`,
          fileContent: `${productCode}-${suffix}`,
        })
    );
    return new OtherLeaflet({
      id,
      productCode,
      batchNumber: undefined,
      leafletType,
      lang,
      epiMarket: undefined,
      xmlFileContent: xmlFile,
      otherFilesContent: otherFiles,
    });
  }

  function composeLeafletId(leaflet: {
    productCode: string;
    batchNumber?: string;
    leafletType: string;
    lang: string;
    epiMarket?: string;
  }) {
    const parts = [leaflet.productCode];
    if (leaflet.batchNumber) parts.push(leaflet.batchNumber);
    parts.push(leaflet.leafletType, leaflet.lang);
    if (leaflet.epiMarket) parts.push(leaflet.epiMarket);
    return parts.join(":");
  }

  async function loadPrivateEntry(
    table: string,
    id: string,
    collection = "decaf-namespaceAeon"
  ) {
    const key = stub.createCompositeKey(table, [id]);
    const data = await stub.getPrivateData(collection, key);
    return JSON.parse(Buffer.from(data).toString("utf8"));
  }

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

  beforeEach(() => {
    jest.clearAllMocks();
    resetCtx();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("handles single CRUD with file relations and mirror copies", async () => {
    const leaflet = buildLeaflet(generateGtin(), "en", "EU");
    const created = parseLeaflet(
      await contract.create(ctx as any, leaflet.serialize())
    );
    ensureCommitted();

    const leafId = composeLeafletId(leaflet);

    const read = parseLeaflet(await contract.read(ctx as any, leafId));
    expect(typeof read.xmlFileContent).toBe("string");
    expect(Array.isArray(read.otherFilesContent)).toBe(true);

    const fileIds = read.otherFilesContent as string[];
    expect(fileIds).toHaveLength(2);

    const rootKey = stub.createCompositeKey("other_leaflet", [leafId]);
    const normalLeaflet = await loadPrivateEntry("other_leaflet", leafId);
    expect(normalLeaflet.productCode).toBe(leaflet.productCode);

    const mirrorLeaflet = await loadPrivateEntry(
      "other_leaflet",
      leafId,
      "mirror-collection"
    );
    expect(mirrorLeaflet.productCode).toBe(leaflet.productCode);

    const firstFileId = fileIds[0];
    const firstFile = await loadPrivateEntry("other_leaflet_file", firstFileId);
    expect(firstFile.fileContent).toContain("manual");

    const mirrorFile = await loadPrivateEntry(
      "other_leaflet_file",
      firstFileId,
      "mirror-collection"
    );
    expect(mirrorFile.fileContent).toContain("manual");

    const fileSet = new Set(fileIds);
    const extraFile = new OtherLeafletFile({
      fileName: `${leafId}-extra.pdf`,
      fileContent: "extra",
    });
    extraFile.leafletId = leafId;
    const updated = new OtherLeaflet({
      ...read,
      otherFilesContent: [...fileIds, extraFile],
    });
    await contract.update(ctx as any, updated.serialize());
    ensureCommitted();

    const afterUpdate = parseLeaflet(await contract.read(ctx as any, leafId));
    expect(afterUpdate.otherFilesContent).toHaveLength(3);
    const newIds = (afterUpdate.otherFilesContent as string[]).filter(
      (ref) => !fileSet.has(ref)
    );
    expect(newIds).toHaveLength(1);

    const newFile = await loadPrivateEntry("other_leaflet_file", newIds[0]);
    expect(newFile.fileContent).toBe("extra");
    await loadPrivateEntry(
      "other_leaflet_file",
      newIds[0],
      "mirror-collection"
    );

    await contract.delete(ctx as any, leafId);
    ensureCommitted();

    await expect(
      stub.getPrivateData("decaf-namespaceAeon", rootKey)
    ).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData("mirror-collection", rootKey)
    ).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData(
        "decaf-namespaceAeon",
        stub.createCompositeKey("other_leaflet_file", [newIds[0]])
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("supports bulk CRUD operations for multiple leaflets", async () => {
    const langs = ["en", "es", "pt"];
    const models = langs.map((lang) =>
      buildLeaflet(generateGtin(), lang, "EU")
    );
    const createdEntries = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((model) => model.serialize()))
      )
    ) as any[];
    ensureCommitted();

    const createdLeaflets = createdEntries.map((entry) => parseLeaflet(entry));
    const keys = models.map((leaflet) => composeLeafletId(leaflet));

    const readBulk = await Promise.all(
      keys.map(async (key) =>
        parseLeaflet(await contract.read(ctx as any, key))
      )
    );
    expect(readBulk).toHaveLength(3);

    const updatedModels = createdLeaflets.map((leaflet, idx) => {
      const id = keys[idx];
      const currentFiles = Array.isArray(leaflet.otherFilesContent)
        ? [...leaflet.otherFilesContent]
        : [];
      const extra = new OtherLeafletFile({
        fileName: `${id}-bulk-${idx}.pdf`,
        fileContent: "bulk",
        leafletId: id,
      });
      return new OtherLeaflet({
        ...leaflet,
        xmlFileContent:
          leaflet.xmlFileContent ||
          new OtherLeafletFile({
            fileName: `${leaflet.productCode}-xml.xml`,
            fileContent: `<xml>${leaflet.productCode}</xml>`,
            leafletId: id,
          }),
        id,
        otherFilesContent: [...currentFiles, extra],
      });
    });
    await contract.updateAll(
      ctx as any,
      JSON.stringify(updatedModels.map((model) => model.serialize()))
    );
    ensureCommitted();

    const updatedBulk = (await Promise.all(
      keys.map(async (key) =>
        parseLeaflet(await contract.read(ctx as any, key))
      )
    )) as any[];
    updatedBulk.forEach((entry, idx) => {
      const leaflet = parseLeaflet(entry);
      const bulkSuffix = `-bulk-${idx}.pdf`;
      const fileIds = leaflet.otherFilesContent as string[];
      expect(Array.isArray(fileIds)).toBe(true);
      expect(fileIds.some((fileId) => fileId.includes(bulkSuffix))).toBe(true);
    });

    await contract.deleteAll(ctx as any, JSON.stringify(keys));
    ensureCommitted();

    for (const key of keys) {
      await expect(contract.read(ctx as any, key)).rejects.toThrow(
        NotFoundError
      );
    }
  });

  it("supports listing, query, and pagination", async () => {
    const langs = ["en", "es", "pt"];
    const entries = langs.map((lang, idx) =>
      buildLeaflet(generateGtin(), lang, `EU${idx}`)
    );
    for (const entry of entries) {
      await contract.create(ctx as any, entry.serialize());
    }
    ensureCommitted();

    const listed = JSON.parse(
      await contract.listBy(ctx as any, "lang", "asc")
    ) as any[];
    const normalized = listed.map((entry) => parseLeaflet(entry));
    expect(normalized[0].lang).toBe("en");

    const queryResults = JSON.parse(
      await contract.query(
        ctx as any,
        JSON.stringify({ attr1: "lang", operator: "EQUAL", comparison: "es" }),
        "lang",
        OrderDirection.ASC
      )
    );
    expect(queryResults).toHaveLength(1);
    expect(parseLeaflet(queryResults[0]).lang).toBe("es");

    const page = JSON.parse(
      await contract.paginateBy(
        ctx as any,
        "lang",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      )
    );
    expect(page.data).toHaveLength(2);
  });

  it("supports optional batchNumber/epiMarket and custom leafletType flows", async () => {
    const customType = "prescribingInfo";
    const singleLeaflet = buildLeafletWithoutOptional(generateGtin(), "en", {
      leafletType: customType,
    });
    const singleLeafletId = composeLeafletId(singleLeaflet);
    const createdSingle = parseLeaflet(
      await contract.create(ctx as any, singleLeaflet.serialize())
    );
    ensureCommitted();
    expect(createdSingle.batchNumber).toBeFalsy();
    expect(createdSingle.epiMarket).toBeFalsy();
    const storedSingle = await loadPrivateEntry(
      "other_leaflet",
      singleLeafletId
    );
    expect(storedSingle.leafletType).toBe(customType);

    const singleExtra = new OtherLeafletFile({
      leafletId: singleLeafletId,
      fileName: `${singleLeafletId}-single.pdf`,
      fileContent: "single-update",
    });
    const singleUpdate = new OtherLeaflet({
      ...storedSingle,
      id: singleLeafletId,
      otherFilesContent: [
        ...(Array.isArray(storedSingle.otherFilesContent)
          ? [...storedSingle.otherFilesContent]
          : []),
        singleExtra,
      ],
    });
    await contract.update(ctx as any, singleUpdate.serialize());
    ensureCommitted();

    const storedUpdated = await loadPrivateEntry(
      "other_leaflet",
      singleLeafletId
    );
    expect(storedUpdated.leafletType).toBe(customType);

    const afterSingle = parseLeaflet(
      await contract.read(ctx as any, singleLeafletId)
    );
    expect(afterSingle.batchNumber).toBeFalsy();
    expect(afterSingle.epiMarket).toBeFalsy();

    await contract.delete(ctx as any, singleLeafletId);
    ensureCommitted();
    await expect(contract.read(ctx as any, singleLeafletId)).rejects.toThrow(
      NotFoundError
    );

    const langs = ["es", "pt"];
    const bulkItems = langs.map((lang) =>
      buildLeafletWithoutOptional(generateGtin(), lang, {
        leafletType: customType,
      })
    );
    const bulkCreated = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(bulkItems.map((model) => model.serialize()))
      )
    ) as any[];
    ensureCommitted();
    const parsedBulk = bulkCreated.map(parseLeaflet);
    parsedBulk.forEach((entry) => {
      expect(entry.batchNumber).toBeFalsy();
      expect(entry.epiMarket).toBeFalsy();
    });

    const bulkIds = bulkItems.map((model) => composeLeafletId(model));
    const updatedBulk = await Promise.all(
      bulkIds.map(async (id, idx) => {
        const stored = await loadPrivateEntry("other_leaflet", id);
        const existingFiles = Array.isArray(stored.otherFilesContent)
          ? [...stored.otherFilesContent]
          : [];
        const extraFile = new OtherLeafletFile({
          leafletId: id,
          fileName: `${id}-bulk-${idx}.pdf`,
          fileContent: "bulk-update",
        });
        return new OtherLeaflet({
          ...stored,
          id,
          otherFilesContent: [...existingFiles, extraFile],
        });
      })
    );
    await contract.updateAll(
      ctx as any,
      JSON.stringify(updatedBulk.map((model) => model.serialize()))
    );
    ensureCommitted();

    const listed = JSON.parse(
      await contract.listBy(ctx as any, "lang", "asc")
    ) as any[];
    expect(listed).toHaveLength(langs.length);

    const queryResults = JSON.parse(
      await contract.query(
        ctx as any,
        JSON.stringify({
          attr1: "leafletType",
          operator: "EQUAL",
          comparison: customType,
        }),
        "lang",
        OrderDirection.ASC
      )
    ) as any[];
    expect(queryResults).toHaveLength(langs.length);

    const page = JSON.parse(
      await contract.paginateBy(
        ctx as any,
        "lang",
        "asc",
        JSON.stringify({ offset: 1, limit: 1 })
      )
    );
    expect(parseLeaflet(page.data[0]).leafletType).toBe(customType);

    await contract.deleteAll(ctx as any, JSON.stringify(bulkIds));
    ensureCommitted();
    for (const id of bulkIds) {
      await expect(contract.read(ctx as any, id)).rejects.toThrow(
        NotFoundError
      );
    }
  });

  describe("mirror enforcement", () => {
    it("writes originate from the owner and ignore mirror mutations", async () => {
      const leaflet = buildLeaflet(generateGtin(), "fr", "EU");
      const created = parseLeaflet(
        await contract.create(ctx as any, leaflet.serialize())
      );
      ensureCommitted();

      const leafId = composeLeafletId(leaflet);
      const key = stub.createCompositeKey("other_leaflet", [leafId]);
      const mirrorData = await loadPrivateEntry(
        "other_leaflet",
        leafId,
        "mirror-collection"
      );
      const mutated = { ...mirrorData, lang: "mirror-only" };
      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(mutated))
      );
      ensureCommitted();

      const read = parseLeaflet(await contract.read(ctx as any, leafId));
      expect(read.lang).toBe("fr");

      const mirrorRead = JSON.parse(
        Buffer.from(
          await stub.getPrivateData("mirror-collection", key)
        ).toString("utf8")
      );
      expect(mirrorRead.lang).toBe("mirror-only");
    });

    it("prevents the mirror MSP from writing and routes reads to the mirror tables", async () => {
      const leaflet = buildLeaflet(generateGtin(), "de", "EU");
      const created = parseLeaflet(
        await contract.create(ctx as any, leaflet.serialize())
      );
      ensureCommitted();

      const leafId = composeLeafletId(leaflet);
      const key = stub.createCompositeKey("other_leaflet", [leafId]);
      const normalEntry = await loadPrivateEntry("other_leaflet", leafId);
      normalEntry.lang = "normal";
      await stub.putPrivateData(
        "decaf-namespaceAeon",
        key,
        Buffer.from(JSON.stringify(normalEntry))
      );
      ensureCommitted();

      const orgBCtx = getOrgBCtx();
      const createdPayload = JSON.stringify(created);
      await expect(
        contract.create(orgBCtx as any, createdPayload)
      ).rejects.toThrow(AuthorizationError);
      await expect(
        contract.update(orgBCtx as any, createdPayload)
      ).rejects.toThrow(AuthorizationError);
      await expect(contract.delete(orgBCtx as any, leafId)).rejects.toThrow(
        AuthorizationError
      );

      const single = parseLeaflet(await contract.read(orgBCtx as any, leafId));
      expect(single.lang).toBe("de");

      const listed = JSON.parse(
        await contract.statement(
          orgBCtx as any,
          "listBy",
          JSON.stringify(["lang", "asc"])
        )
      ) as any[];
      expect(listed.some((entry) => parseLeaflet(entry).lang === "de")).toBe(
        true
      );

      const paged = JSON.parse(
        await contract.paginateBy(
          orgBCtx as any,
          "lang",
          "asc",
          JSON.stringify({ offset: 1, limit: 1 })
        )
      );
      expect(parseLeaflet(paged.data[0]).lang).toBe("de");

      const queryList = JSON.parse(
        await contract.query(
          orgBCtx as any,
          JSON.stringify({
            attr1: "lang",
            operator: "EQUAL",
            comparison: "de",
          }),
          "lang",
          "asc"
        )
      );
      expect(queryList).toHaveLength(1);
    });

    describe("custom leafletType mirrors", () => {
      const customType = "prescribingInfo";

      it("keeps owner reads on the private collection while writes replicate for custom types", async () => {
        const leaflet = buildLeafletWithoutOptional(generateGtin(), "fr", {
          leafletType: customType,
        });
        await contract.create(ctx as any, leaflet.serialize());
        ensureCommitted();

        const leafId = composeLeafletId(leaflet);
        const key = stub.createCompositeKey("other_leaflet", [leafId]);
        const mirrorEntry = await loadPrivateEntry(
          "other_leaflet",
          leafId,
          "mirror-collection"
        );
        const mirrorOverride = { ...mirrorEntry, lang: "mirror-only" };
        await stub.putPrivateData(
          "mirror-collection",
          key,
          Buffer.from(JSON.stringify(mirrorOverride))
        );
        ensureCommitted();

        const ownerRead = parseLeaflet(await contract.read(ctx as any, leafId));
        expect(ownerRead.leafletType).toBe(customType);
        expect(ownerRead.lang).toBe(leaflet.lang);
        expect(ownerRead.lang).not.toBe("mirror-only");

        const extraFile = new OtherLeafletFile({
          leafletId: leafId,
          fileName: `${leafId}-owner.pdf`,
          fileContent: "owner-change",
        });
        const updatedOwner = new OtherLeaflet({
          ...ownerRead,
          otherFilesContent: [
            ...(ownerRead.otherFilesContent as string[]),
            extraFile,
          ],
        });
        await contract.update(ctx as any, updatedOwner.serialize());
        ensureCommitted();

        const normalAfterUpdate = await loadPrivateEntry(
          "other_leaflet",
          leafId
        );
        const mirrorAfterUpdate = await loadPrivateEntry(
          "other_leaflet",
          leafId,
          "mirror-collection"
        );
        expect(normalAfterUpdate.leafletType).toBe(customType);
        expect(mirrorAfterUpdate.leafletType).toBe(customType);
        expect(
          (normalAfterUpdate.otherFilesContent as string[]).length
        ).toBeGreaterThan(2);
        expect(
          (mirrorAfterUpdate.otherFilesContent as string[]).length
        ).toBeGreaterThan(2);

        await contract.delete(ctx as any, leafId);
        ensureCommitted();
        await expect(
          stub.getPrivateData("mirror-collection", key)
        ).rejects.toThrow(NotFoundError);
        await expect(
          stub.getPrivateData("decaf-namespaceAeon", key)
        ).rejects.toThrow(NotFoundError);
      });

      it("channels mirror MSP reads to mirror collection and forbids writes for custom types", async () => {
        const leaflet = buildLeafletWithoutOptional(generateGtin(), "de", {
          leafletType: customType,
        });
        await contract.create(ctx as any, leaflet.serialize());
        ensureCommitted();

        const leafId = composeLeafletId(leaflet);
        const key = stub.createCompositeKey("other_leaflet", [leafId]);
        const mirrorEntry = await loadPrivateEntry(
          "other_leaflet",
          leafId,
          "mirror-collection"
        );
        const mirrorLang = "mirror-only";
        const mirrorOverride = { ...mirrorEntry, lang: mirrorLang };
        await stub.putPrivateData(
          "mirror-collection",
          key,
          Buffer.from(JSON.stringify(mirrorOverride))
        );
        ensureCommitted();

        const mirrorCtx = getOrgBCtx();
        const payload = leaflet.serialize();
        await expect(
          contract.create(mirrorCtx as any, payload)
        ).rejects.toThrow(AuthorizationError);
        await expect(
          contract.update(mirrorCtx as any, payload)
        ).rejects.toThrow(AuthorizationError);
        await expect(contract.delete(mirrorCtx as any, leafId)).rejects.toThrow(
          AuthorizationError
        );

        const mirrorRead = parseLeaflet(
          await contract.read(mirrorCtx as any, leafId)
        );
        expect(mirrorRead.lang).toBe(mirrorLang);
        expect(mirrorRead.leafletType).toBe(customType);

        const listed = JSON.parse(
          await contract.listBy(mirrorCtx as any, "lang", "asc")
        ) as any[];
        expect(parseLeaflet(listed[0]).lang).toBe(mirrorLang);

        const query = JSON.parse(
          await contract.query(
            mirrorCtx as any,
            JSON.stringify({
              attr1: "lang",
              operator: "EQUAL",
              comparison: mirrorLang,
            }),
            "lang",
            "asc"
          )
        );
        expect(query).toHaveLength(1);

        const pagination = JSON.parse(
          await contract.paginateBy(
            mirrorCtx as any,
            "lang",
            "asc",
            JSON.stringify({ offset: 1, limit: 1 })
          )
        );
        expect(parseLeaflet(pagination.data[0]).lang).toBe(mirrorLang);

        await contract.delete(ctx as any, leafId);
        ensureCommitted();
      });
    });
  });
});
