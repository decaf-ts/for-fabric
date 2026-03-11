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
    super("OtherLeafletVersionContract", OtherLeaflet);
  }
}

describe("OtherLeaflet model version flows", () => {
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

function buildLeaflet(
  productCode: string,
  lang: string,
  epiMarket = "EU"
) {
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
      fileName: `${productCode}-leaflet.xml`,
      fileContent: `<xml>${productCode}</xml>`,
      leafletId: id,
    });
    const otherFiles = ["manual", "supplement"].map(
      (suffix) =>
        new OtherLeafletFile({
          fileName: `${productCode}-${suffix}.pdf`,
          fileContent: `${productCode}-${suffix}`,
          leafletId: id,
        })
    );

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
  const otherFiles = ["manual", "supplement"].map((suffix) =>
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

  async function loadPrivateEntry(
    table: string,
    id: string,
    collection = "decaf-namespaceAeon"
  ) {
    const key = stub.createCompositeKey(table, [id]);
    const data = await stub.getPrivateData(collection, key);
    return JSON.parse(Buffer.from(data).toString("utf8"));
  }

  function getMirrorCtx() {
    const mirrorCtx = getMockCtx();
    const mirrorStub = Object.create(stub);
    mirrorStub.getCreator = async () => ({
      idBytes: Buffer.from("creator-org-b"),
      mspid: "org-b",
    });
    mirrorStub.getMspID = () => "org-b";
    return Object.assign(mirrorCtx, {
      stub: mirrorStub,
      clientIdentity: {
        getID: () => "id-org-b",
        getMSPID: () => "org-b",
        getIDBytes: () => Buffer.from("creator-org-b"),
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

  it("handles single CRUD through the leaflets-to-files relation", async () => {
    const leaflet = buildLeaflet(generateGtin(), "en");
    const created = parseLeaflet(
      await contract.create(ctx as any, leaflet.serialize())
    );
    ensureCommitted();

    const leafId = composeLeafletId(leaflet);
    const read = parseLeaflet(await contract.read(ctx as any, leafId));
    expect(read.productCode).toBe(leaflet.productCode);
    const fileRefs = read.otherFilesContent as string[];
    expect(fileRefs).toHaveLength(2);
    expect(typeof read.xmlFileContent).toBe("string");

    const firstFileId = fileRefs[0];
    const normalFile = await loadPrivateEntry("other_leaflet_file", firstFileId);
    const mirrorFile = await loadPrivateEntry(
      "other_leaflet_file",
      firstFileId,
      "mirror-collection"
    );
    expect(normalFile.fileContent).toContain("manual");
    expect(mirrorFile.fileContent).toContain("manual");

    const normalLeaflet = await loadPrivateEntry("other_leaflet", leafId);
    const mirrorLeaflet = await loadPrivateEntry(
      "other_leaflet",
      leafId,
      "mirror-collection"
    );
    expect(normalLeaflet.productCode).toBe(leaflet.productCode);
    expect(mirrorLeaflet.productCode).toBe(leaflet.productCode);

    const extraFile = new OtherLeafletFile({
      fileName: `${leafId}-extra.pdf`,
      fileContent: "extra",
      leafletId: leafId,
    });
    const updatedLeaflet = new OtherLeaflet({
      ...read,
      otherFilesContent: [...fileRefs, extraFile],
    });
    await contract.update(ctx as any, updatedLeaflet.serialize());
    ensureCommitted();

    const afterUpdate = parseLeaflet(await contract.read(ctx as any, leafId));
    const updatedRefs = afterUpdate.otherFilesContent as string[];
    expect(updatedRefs).toHaveLength(fileRefs.length + 1);
    const addedRefs = updatedRefs.filter((ref) => !fileRefs.includes(ref));
    expect(addedRefs).toHaveLength(1);
    const addedId = addedRefs[0];
    const addedNormal = await loadPrivateEntry("other_leaflet_file", addedId);
    const addedMirror = await loadPrivateEntry(
      "other_leaflet_file",
      addedId,
      "mirror-collection"
    );
    expect(addedNormal.fileContent).toBe("extra");
    expect(addedMirror.fileContent).toBe("extra");

    await contract.delete(ctx as any, leafId);
    ensureCommitted();

    await expect(contract.read(ctx as any, leafId)).rejects.toThrow(
      NotFoundError
    );
    const leafletKey = stub.createCompositeKey("other_leaflet", [leafId]);
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", leafletKey)
    ).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData("mirror-collection", leafletKey)
    ).rejects.toThrow(NotFoundError);
    const xmlFileId =
      typeof read.xmlFileContent === "string"
        ? read.xmlFileContent
        : read.xmlFileContent?.id;
    if (xmlFileId) {
      const xmlKey = stub.createCompositeKey("other_leaflet_file", [xmlFileId]);
      await expect(
        stub.getPrivateData("decaf-namespaceAeon", xmlKey)
      ).rejects.toThrow(NotFoundError);
      await expect(
        stub.getPrivateData("mirror-collection", xmlKey)
      ).rejects.toThrow(NotFoundError);
    }
  });

  it("supports bulk CRUD plus listing, querying and pagination", async () => {
    const languages = ["en", "es", "pt"];
    const entries = languages.map((lang, idx) =>
      buildLeaflet(generateGtin(), lang, `EU-${idx}`)
    );
    const createdEntries = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(entries.map((entry) => entry.serialize()))
      )
    ) as string[];
    ensureCommitted();
    expect(createdEntries).toHaveLength(entries.length);

    const ids = entries.map((entry) => composeLeafletId(entry));
    const loaded = await Promise.all(
      ids.map(async (key) => parseLeaflet(await contract.read(ctx as any, key)))
    );
    expect(loaded).toHaveLength(entries.length);

    const updatedModels = loaded.map((entry, idx) => {
      const file = new OtherLeafletFile({
        fileName: `${composeLeafletId(entry)}-bulk-${idx}.pdf`,
        fileContent: "bulk",
        leafletId: entry.id,
      });
      return new OtherLeaflet({
        ...entry,
        otherFilesContent: [...(entry.otherFilesContent as string[]), file],
      });
    });
    await contract.updateAll(
      ctx as any,
      JSON.stringify(updatedModels.map((model) => model.serialize()))
    );
    ensureCommitted();

    const listed = JSON.parse(
      await contract.listBy(ctx as any, "lang", "asc")
    ) as any[];
    expect(parseLeaflet(listed[0]).lang).toBe("en");

    const queryResults = JSON.parse(
      await contract.query(
        ctx as any,
        JSON.stringify({
          attr1: "lang",
          operator: "EQUAL",
          comparison: "es",
        }),
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

    await contract.deleteAll(ctx as any, JSON.stringify(ids));
    ensureCommitted();

    for (const id of ids) {
      await expect(contract.read(ctx as any, id)).rejects.toThrow(
        NotFoundError
      );
    }
  });

  it("handles optional batchNumber/epiMarket and custom leafletType version flows", async () => {
    const customType = "prescribingInfo";
    const singleLeaflet = buildLeafletWithoutOptional(
      generateGtin(),
      "en",
      { leafletType: customType }
    );
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
    const bulkModels = langs.map((lang) =>
      buildLeafletWithoutOptional(generateGtin(), lang, {
        leafletType: customType,
      })
    );
    const bulkCreated = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(bulkModels.map((model) => model.serialize()))
      )
    ) as any[];
    ensureCommitted();
    const parsedBulk = bulkCreated.map(parseLeaflet);
    parsedBulk.forEach((entry) => {
      expect(entry.batchNumber).toBeFalsy();
      expect(entry.epiMarket).toBeFalsy();
    });

    const bulkIds = bulkModels.map((model) => composeLeafletId(model));
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
      await expect(contract.read(ctx as any, id)).rejects.toThrow(NotFoundError);
    }
  });

  describe("mirror enforcement", () => {
    it("keeps owner reads tied to the normal collection while writes replicate", async () => {
      const leaflet = buildLeaflet(generateGtin(), "fr");
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
      const ownerLang = leaflet.lang;
      expect(ownerRead.lang).toBe(ownerLang);
      expect(ownerRead.lang).not.toBe("mirror-only");

      const extraFile = new OtherLeafletFile({
        fileName: `${leafId}-owner.pdf`,
        fileContent: "owner-change",
        leafletId: leafId,
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

      const normalAfterUpdate = await loadPrivateEntry("other_leaflet", leafId);
      const mirrorAfterUpdate = await loadPrivateEntry(
        "other_leaflet",
        leafId,
        "mirror-collection"
      );
      expect(normalAfterUpdate.lang).toBe(ownerLang);
      expect(mirrorAfterUpdate.lang).toBe(ownerLang);
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

    it("routes mirror MSP reads to the mirror collection and blocks writes", async () => {
      const leaflet = buildLeaflet(generateGtin(), "de");
      await contract.create(ctx as any, leaflet.serialize());
      ensureCommitted();

      const leafId = composeLeafletId(leaflet);
      const key = stub.createCompositeKey("other_leaflet", [leafId]);
      const mirrorLang = "mirror-only";
      const mirrorEntry = await loadPrivateEntry(
        "other_leaflet",
        leafId,
        "mirror-collection"
      );
      const mirrorOverride = { ...mirrorEntry, lang: mirrorLang };
      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(mirrorOverride))
      );
      ensureCommitted();

      const mirrorCtx = getMirrorCtx();
      const payload = leaflet.serialize();
      await expect(
        contract.create(mirrorCtx as any, payload)
      ).rejects.toThrow(AuthorizationError);
      await expect(
        contract.update(mirrorCtx as any, payload)
      ).rejects.toThrow(AuthorizationError);
      await expect(
        contract.delete(mirrorCtx as any, leafId)
      ).rejects.toThrow(AuthorizationError);

      const mirrorRead = parseLeaflet(
        await contract.read(mirrorCtx as any, leafId)
      );
      expect(mirrorRead.lang).toBe(mirrorLang);

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
    });

    describe("custom leafletType mirrors", () => {
      const customType = "prescribingInfo";

      it("keeps owner reads tied to the private collection while writes replicate for custom types", async () => {
        const leaflet = buildLeafletWithoutOptional(
          generateGtin(),
          "fr",
          { leafletType: customType }
        );
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
          fileName: `${leafId}-owner.pdf`,
          fileContent: "owner-change",
          leafletId: leafId,
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

        const normalAfterUpdate = await loadPrivateEntry("other_leaflet", leafId);
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

      it("routes mirror MSP reads to the mirror collection and blocks writes for custom types", async () => {
        const leaflet = buildLeafletWithoutOptional(
          generateGtin(),
          "de",
          { leafletType: customType }
        );
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

        const mirrorCtx = getMirrorCtx();
        const payload = leaflet.serialize();
        await expect(
          contract.create(mirrorCtx as any, payload)
        ).rejects.toThrow(AuthorizationError);
        await expect(
          contract.update(mirrorCtx as any, payload)
        ).rejects.toThrow(AuthorizationError);
        await expect(
          contract.delete(mirrorCtx as any, leafId)
        ).rejects.toThrow(AuthorizationError);

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
