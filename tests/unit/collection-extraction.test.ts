import "../../src/shared/overrides";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import {
  extractCollections,
  PrivateCollection,
} from "../../src/client/collections/index";
import { Model } from "@decaf-ts/decorator-validation";

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

    expect(mirrorCollection).toBeDefined();
  });
});
