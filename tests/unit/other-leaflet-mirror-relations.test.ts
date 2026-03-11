import "../../src/shared/overrides";
import { AuthorizationError, NotFoundError } from "@decaf-ts/db-decorators";
import { OrderDirection } from "@decaf-ts/core";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { getMockCtx, getStubMock } from "./ContextMock";
import { Leaflet as OtherLeaflet } from "../../src/contract/models/OtherLeaflet";
import { OtherLeafletFile } from "../../src/contract/models/OtherLeafletFile";
import { generateGtin } from "../../src/contract/models/gtin";

jest.setTimeout(30000);

class OtherLeafletRelationsContract extends SerializedCrudContract<OtherLeaflet> {
  constructor() {
    super("OtherLeafletRelationsContract", OtherLeaflet);
  }
}

describe("OtherLeaflet relation and mirror integration", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  const contract = new OtherLeafletRelationsContract();

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
    const pushOptional = (value?: string) => {
      if (value !== undefined && value !== null && value.length > 0) {
        parts.push(value);
      }
    };
    pushOptional(leaflet.batchNumber);
    parts.push(leaflet.leafletType, leaflet.lang);
    pushOptional(leaflet.epiMarket);
    return parts.join(":");
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
      batchNumber,
      leafletType,
      lang,
      epiMarket,
      xmlFileContent: xmlFile,
      otherFilesContent: otherFiles,
    });
  }

  function buildLeafletWithoutBatch(
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
    keyValue: string,
    collection = "decaf-namespaceAeon"
  ) {
    const key = stub.createCompositeKey(table, [keyValue]);
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

  it("handles single CRUD through the leaflet relations", async () => {
    const leaflet = buildLeaflet(generateGtin(), "en");
    const leafId = composeLeafletId(leaflet);
    await contract.create(ctx as any, leaflet.serialize());
    ensureCommitted();

    const read = parseLeaflet(await contract.read(ctx as any, leafId));
    expect(read.productCode).toBe(leaflet.productCode);
    expect(Array.isArray(read.otherFilesContent)).toBe(true);
    expect(typeof read.xmlFileContent).toBe("string");

    const normalLeaflet = await loadPrivateEntry("other_leaflet", leafId);
    const mirrorLeaflet = await loadPrivateEntry(
      "other_leaflet",
      leafId,
      "mirror-collection"
    );
    expect(normalLeaflet.productCode).toBe(leaflet.productCode);
    expect(mirrorLeaflet.productCode).toBe(leaflet.productCode);

    const fileRefs = read.otherFilesContent as string[];
    const firstFile = await loadPrivateEntry("other_leaflet_file", fileRefs[0]);
    const mirrorFile = await loadPrivateEntry(
      "other_leaflet_file",
      fileRefs[0],
      "mirror-collection"
    );
    expect(firstFile.fileContent).toContain("manual");
    expect(mirrorFile.fileContent).toContain("manual");

    const extraFile = new OtherLeafletFile({
      leafletId: leafId,
      fileName: `${leafId}-extra.pdf`,
      fileContent: "extra",
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
    const newRefs = updatedRefs.filter((ref) => !fileRefs.includes(ref));
    expect(newRefs).toHaveLength(1);
    await loadPrivateEntry("other_leaflet_file", newRefs[0]);
    await loadPrivateEntry("other_leaflet_file", newRefs[0], "mirror-collection");

    await contract.delete(ctx as any, leafId);
    ensureCommitted();

    await expect(contract.read(ctx as any, leafId)).rejects.toThrow(
      NotFoundError
    );
    const leafKey = stub.createCompositeKey("other_leaflet", [leafId]);
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", leafKey)
    ).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData("mirror-collection", leafKey)
    ).rejects.toThrow(NotFoundError);
  });

  it("supports bulk CRUD plus listing, querying, and pagination", async () => {
    const langs = ["en", "es", "pt"];
    const models = langs.map((lang, idx) =>
      buildLeaflet(generateGtin(), lang, `EU${idx}`)
    );
    const createdEntries = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(models.map((model) => model.serialize()))
      )
    ) as string[];
    ensureCommitted();
    expect(createdEntries.length).toBe(models.length);

    const ids = models.map((model) => composeLeafletId(model));
    const readBulk = await Promise.all(
      ids.map(async (key) => parseLeaflet(await contract.read(ctx as any, key)))
    );
    expect(readBulk).toHaveLength(models.length);

    const updated = readBulk.map((entry, idx) => {
      const fileRefs = Array.isArray(entry.otherFilesContent)
        ? [...(entry.otherFilesContent as string[])]
        : [];
      const leafId = entry.id ?? composeLeafletId(entry);
      const extra = new OtherLeafletFile({
        leafletId: leafId,
        fileName: `${leafId}-bulk-${idx}.pdf`,
        fileContent: "bulk",
      });
      return new OtherLeaflet({
        ...entry,
        id: leafId,
        otherFilesContent: [...fileRefs, extra],
      });
    });

    await contract.updateAll(
      ctx as any,
      JSON.stringify(updated.map((model) => model.serialize()))
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

  it("handles leaflets without batchNumber/epiMarket and custom leafletType", async () => {
    const baseLeaflet = buildLeafletWithoutBatch(generateGtin(), "en", {
      leafletType: "prescribingInfo",
    });
    await contract.create(ctx as any, baseLeaflet.serialize());
    const leafId = composeLeafletId(baseLeaflet);
    ensureCommitted();

    const read = parseLeaflet(await contract.read(ctx as any, leafId));
    expect(read.leafletType).toBe("prescribingInfo");
    expect(read.batchNumber).toBeFalsy();
    expect(read.epiMarket).toBeFalsy();

    const extraFile = new OtherLeafletFile({
      leafletId: leafId,
      fileName: `${leafId}-extra.pdf`,
      fileContent: "extra",
    });
    const updated = new OtherLeaflet({
      ...read,
      otherFilesContent: [
        ...(read.otherFilesContent as string[]),
        extraFile,
      ],
    });
    await contract.update(ctx as any, updated.serialize());
    ensureCommitted();

    const afterUpdate = await loadPrivateEntry("other_leaflet", leafId);
    expect(afterUpdate.batchNumber).toBeFalsy();
    expect(afterUpdate.epiMarket).toBeFalsy();

    const extras = ["es", "pt"].map((lang) =>
      buildLeafletWithoutBatch(generateGtin(), lang, {
        leafletType: "prescribingInfo",
      })
    );
    const createdEntries = JSON.parse(
      await contract.createAll(
        ctx as any,
        JSON.stringify(extras.map((model) => model.serialize()))
      )
    ) as string[];
    ensureCommitted();
    const parsedExtras = createdEntries.map((entry) => parseLeaflet(entry));
    const additionalIds = extras.map((model) => composeLeafletId(model));
    const allIds = [leafId, ...additionalIds];

    const listed = JSON.parse(
      await contract.listBy(ctx as any, "lang", "asc")
    ) as any[];
    expect(listed).toHaveLength(allIds.length);
    expect(parseLeaflet(listed[0]).leafletType).toBe("prescribingInfo");

    const queryResults = JSON.parse(
      await contract.query(
        ctx as any,
        JSON.stringify({
          attr1: "leafletType",
          operator: "EQUAL",
          comparison: "prescribingInfo",
        }),
        "lang",
        OrderDirection.ASC
      )
    );
    expect(queryResults).toHaveLength(allIds.length);

    const page = JSON.parse(
      await contract.paginateBy(
        ctx as any,
        "lang",
        "asc",
        JSON.stringify({ offset: 1, limit: 2 })
      )
    );
    expect(page.data).toHaveLength(2);

    await contract.deleteAll(ctx as any, JSON.stringify(allIds));
    ensureCommitted();

    for (const id of allIds) {
      await expect(contract.read(ctx as any, id)).rejects.toThrow(
        NotFoundError
      );
    }
  });

  describe("mirror enforcement", () => {
    it("keeps owner reads stuck to the private collection and replicates writes", async () => {
      const leaflet = buildLeaflet(generateGtin(), "fr");
      const leafId = composeLeafletId(leaflet);
      await contract.create(ctx as any, leaflet.serialize());
      ensureCommitted();

      const key = stub.createCompositeKey("other_leaflet", [leafId]);
      const mirrorEntry = await loadPrivateEntry(
        "other_leaflet",
        leafId,
        "mirror-collection"
      );
      const mirrorOverride = { ...mirrorEntry, lang: "mirror-latest" };
      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(mirrorOverride))
      );
      ensureCommitted();

      const ownerRead = parseLeaflet(await contract.read(ctx as any, leafId));
      const ownerLang = leaflet.lang;
      expect(ownerRead.lang).toBe(ownerLang);
      expect(ownerRead.lang).not.toBe("mirror-latest");

      const ownerList = JSON.parse(
        await contract.listBy(ctx as any, "lang", "asc")
      ) as any[];
      expect(parseLeaflet(ownerList[0]).lang).toBe(ownerLang);

      const ownerQuery = JSON.parse(
        await contract.query(
          ctx as any,
          JSON.stringify({
            attr1: "lang",
            operator: "EQUAL",
            comparison: ownerLang,
          }),
          "lang",
          OrderDirection.ASC
        )
      );
      expect(ownerQuery).toHaveLength(1);
      expect(parseLeaflet(ownerQuery[0]).lang).toBe(ownerLang);

      const ownerPage = JSON.parse(
        await contract.paginateBy(
          ctx as any,
          "lang",
          "asc",
          JSON.stringify({ offset: 1, limit: 1 })
        )
      );
      expect(parseLeaflet(ownerPage.data[0]).lang).toBe(ownerLang);

      const extraFile = new OtherLeafletFile({
        leafletId: leafId,
        fileName: `${leafId}-owner-update.pdf`,
        fileContent: "owner-update",
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

      const normalAfter = await loadPrivateEntry("other_leaflet", leafId);
      const mirrorAfter = await loadPrivateEntry(
        "other_leaflet",
        leafId,
        "mirror-collection"
      );
      expect(normalAfter.lang).toBe(ownerLang);
      expect(mirrorAfter.lang).toBe(ownerLang);

      const nowRead = parseLeaflet(await contract.read(ctx as any, leafId));
      const nowFiles = nowRead.otherFilesContent as string[];
      const previousSet = new Set(ownerRead.otherFilesContent as string[]);
      const newFiles = nowFiles.filter((ref) => !previousSet.has(ref));
      expect(newFiles).toHaveLength(1);
      await loadPrivateEntry("other_leaflet_file", newFiles[0]);
      await loadPrivateEntry("other_leaflet_file", newFiles[0], "mirror-collection");

      await contract.delete(ctx as any, leafId);
      ensureCommitted();

      await expect(
        stub.getPrivateData("decaf-namespaceAeon", key)
      ).rejects.toThrow(NotFoundError);
      await expect(
        stub.getPrivateData("mirror-collection", key)
      ).rejects.toThrow(NotFoundError);
    });

    it("routes mirror MSP reads exclusively to mirror collection and blocks writes", async () => {
      const leaflet = buildLeaflet(generateGtin(), "de");
      const leafId = composeLeafletId(leaflet);
      await contract.create(ctx as any, leaflet.serialize());
      ensureCommitted();

      const key = stub.createCompositeKey("other_leaflet", [leafId]);
      const normalEntry = {
        ...(await loadPrivateEntry("other_leaflet", leafId)),
        lang: "owner-final",
      };
      await stub.putPrivateData(
        "decaf-namespaceAeon",
        key,
        Buffer.from(JSON.stringify(normalEntry))
      );
      const mirrorEntry = {
        ...(await loadPrivateEntry(
          "other_leaflet",
          leafId,
          "mirror-collection"
        )),
        lang: "mirror-only",
      };
      await stub.putPrivateData(
        "mirror-collection",
        key,
        Buffer.from(JSON.stringify(mirrorEntry))
      );
      ensureCommitted();

      const mirrorCtx = getMirrorCtx();
      await expect(
        contract.create(mirrorCtx as any, leaflet.serialize())
      ).rejects.toThrow(AuthorizationError);
      await expect(
        contract.update(mirrorCtx as any, leaflet.serialize())
      ).rejects.toThrow(AuthorizationError);
      await expect(contract.delete(mirrorCtx as any, leafId)).rejects.toThrow(
        AuthorizationError
      );

      const mirrorRead = parseLeaflet(await contract.read(mirrorCtx as any, leafId));
      expect(mirrorRead.lang).toBe("mirror-only");

      const mirrorListed = JSON.parse(
        await contract.listBy(mirrorCtx as any, "lang", "asc")
      ) as any[];
      expect(parseLeaflet(mirrorListed[0]).lang).toBe("mirror-only");

      const mirrorQuery = JSON.parse(
        await contract.query(
          mirrorCtx as any,
          JSON.stringify({
            attr1: "lang",
            operator: "EQUAL",
            comparison: "mirror-only",
          }),
          "lang",
          OrderDirection.ASC
        )
      );
      expect(mirrorQuery).toHaveLength(1);
      expect(parseLeaflet(mirrorQuery[0]).lang).toBe("mirror-only");

      const mirrorPage = JSON.parse(
        await contract.paginateBy(
          mirrorCtx as any,
          "lang",
          "asc",
          JSON.stringify({ offset: 1, limit: 1 })
        )
      );
      expect(parseLeaflet(mirrorPage.data[0]).lang).toBe("mirror-only");

      await contract.delete(ctx as any, leafId);
      ensureCommitted();
    });
  });
});
