import "../../src/shared/overrides";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import {
  extractCollections,
  PrivateCollection,
} from "../../src/client/collections/index";
import { Model } from "@decaf-ts/decorator-validation";

describe.skip("collection extraction", () => {
  it("extracts collections", async () => {
    const clazz = OtherProductShared;

    const mainMsp = "pla";

    const otherMsps = ["msp1", "msp2", "msp3"];

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
    expect(mirrorCollection).toBeDefined();
  });
});
