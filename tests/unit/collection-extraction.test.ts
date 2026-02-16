import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import {
  extractCollections,
  PrivateCollection,
  writeCollectionDesignDocs,
} from "../../src/client/collections/index";
import { model, Model, ModelArg } from "@decaf-ts/decorator-validation";
import { BaseModel, pk, table } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../src/shared/constants";
import { generateModelDesignDocs } from "../../src/client/indexes";
import { view } from "@decaf-ts/core";
import fs from "fs";
import os from "os";
import path from "path";

describe("collection extraction", () => {
  it("extracts collections", async () => {
    const clazz = OtherProductShared;

    const mainMsp = "main-org";

    const otherMsps = ["msp1", "msp2"];

    const mirrorMeta = Model.mirroredAt(clazz);

    const collections: Record<string, any> = {};
    for (const msp of otherMsps) {
      collections[msp] = await extractCollections(
        clazz,
        [msp, mainMsp],
        {
          sharedCols: {
            requiredPeerCount: 1,
            maxPeerCount: 4,
          },
        },
        !!mirrorMeta
      );
    }

    let mirrorCollection: PrivateCollection;

    if (mirrorMeta) {
      Object.keys(collections).forEach((msp: string) => {
        collections[msp].privates = collections[msp].privates?.filter((p) => {
          if (p.name !== (mirrorMeta.resolver as string)) return true;
          mirrorCollection = p;
          return false;
        });
      });
    }

    expect(collections).toBeDefined();

    const keys = Object.keys(collections);
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(otherMsps);

    const col0 = collections[keys[0]];
    expect(col0.privates).toHaveLength(0);
    expect(col0.shared).toHaveLength(1);

    // expect(shared.)

    if (mirrorMeta) {
      expect(mirrorCollection).toBeDefined();
    } else {
      expect(mirrorCollection).toBeUndefined();
    }
  });

  it("writes collection design docs for decorated models", () => {
    @uses(FabricFlavour)
    @table("collection_view_model")
    @model()
    class CollectionViewModel extends BaseModel {
      @pk({ type: String })
      id!: string;

      @view({ name: "by_status", ddoc: "collection_view_ddoc" })
      status!: string;

      constructor(arg?: ModelArg<CollectionViewModel>) {
        super(arg);
      }
    }

    const docs = generateModelDesignDocs(CollectionViewModel);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-collections-"));
    const collectionName = "MyCollection";
    writeCollectionDesignDocs(docs, tmpDir, collectionName);

    const designDir = path.join(
      tmpDir,
      "META-INF",
      "statedb",
      "couchdb",
      "collections",
      collectionName,
      "design_docs"
    );

    expect(fs.existsSync(designDir)).toBe(true);
    const files = fs.readdirSync(designDir);
    expect(files.length).toBeGreaterThan(0);

    const storedDoc = JSON.parse(
      fs.readFileSync(path.join(designDir, files[0]), "utf-8")
    );
    expect(storedDoc._id).toBe("_design/collection_view_ddoc");
  });
});
