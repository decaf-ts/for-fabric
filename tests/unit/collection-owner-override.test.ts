import {
  extractCollections,
  sharedCollectionFor,
} from "../../src/client/collections/generation";
import { OtherProductShared } from "../../src/contract/trackedModels/OtherProductShared";
import { History } from "../../src/contract/trackedModels/History";
import { model, ModelArg } from "@decaf-ts/decorator-validation";
import { BaseModel, pk, table } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour, privateData } from "../../src/shared/index";

const MAIN_MSP = "orga";

describe("collection extraction (owner override & dedupe)", () => {
  it("keeps legacy output when no owner override is given (no-override regression guard)", async () => {
    // mirrors the CLI's per-msp call shape: extractCollections(clazz, [msp, mainMspId])
    const { privates, shared } = await extractCollections(OtherProductShared, [
      "orgb",
      MAIN_MSP,
    ]);

    expect(privates).toHaveLength(0);
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toBe("decaf-namespaceOrgb");
    expect(shared[0].policy).toBe("OR('orgb.member','orga.member')");
    expect(shared[0].endorsementPolicy?.signaturePolicy).toBe(
      "AND('orgb.peer','orga.peer')"
    );

    const historyCols = await extractCollections(History, ["orgb", MAIN_MSP]);
    expect(historyCols.shared[0].name).toBe("ptp-historyOrgb");
    expect(historyCols.shared[0].policy).toBe(
      "OR('orgb.member','orga.member')"
    );
    expect(historyCols.shared[0].endorsementPolicy?.signaturePolicy).toBe(
      "AND('orgb.peer','orga.peer')"
    );
  });

  it("transfers ownership of the overridden msp's collections to the main msp while keeping collection names", async () => {
    const { privates, shared } = await extractCollections(
      OtherProductShared,
      ["orgb", MAIN_MSP],
      {},
      true,
      "orgb"
    );

    // collection names keep the original msp suffix (resolved from mspIds[0])
    expect(shared[0].name).toBe("decaf-namespaceOrgb");
    // policies are generated against the main msp, without duplicates
    expect(shared[0].policy).toBe("OR('orga.member')");
    expect(shared[0].endorsementPolicy?.signaturePolicy).toBe(
      "AND('orga.peer')"
    );

    // the mirror collection is unaffected by the override and added exactly once
    expect(privates.map((p) => p.name)).toEqual(["mirror-collection"]);
    expect(privates[0].policy).toBe("OR('orga.member')");
    expect(privates[0].endorsementPolicy?.signaturePolicy).toBe(
      "OR('orga.peer')"
    );
    expect(privates[0].memberOnlyWrite).toBe(false);
  });

  it("does not duplicate private collections for the overridden msp", async () => {
    @uses(FabricFlavour)
    @table("override_private_model")
    @model()
    @privateData("my-priv-collection")
    class PrivateModel extends BaseModel {
      @pk({ type: String })
      id!: string;

      constructor(arg?: ModelArg<PrivateModel>) {
        super(arg);
      }
    }

    const { privates, shared } = await extractCollections(
      PrivateModel,
      ["orgb", MAIN_MSP],
      {},
      false,
      "orgb"
    );

    // one entry per private collection, not one per (duplicated) owner entry
    expect(privates).toHaveLength(1);
    expect(privates[0].name).toBe("my-priv-collection");
    expect(privates[0].policy).toBe("OR('orga.member')");
    expect(privates[0].endorsementPolicy?.signaturePolicy).toBe(
      "OR('orga.peer')"
    );
    expect(shared).toHaveLength(0);
  });

  it("is a no-op when the override msp is not in the msp list", async () => {
    const withoutOverride = await extractCollections(
      OtherProductShared,
      ["orgb", MAIN_MSP],
      {},
      true
    );
    const withOverride = await extractCollections(
      OtherProductShared,
      ["orgb", MAIN_MSP],
      {},
      true,
      "orgz"
    );

    expect(withOverride).toEqual(withoutOverride);
  });

  it("falls back to the msp itself when it is the only entry in the list", async () => {
    const { shared } = await extractCollections(
      OtherProductShared,
      ["orgb"],
      {},
      false,
      "orgb"
    );

    expect(shared[0].name).toBe("decaf-namespaceOrgb");
    expect(shared[0].policy).toBe("OR('orgb.member')");
    expect(shared[0].endorsementPolicy?.signaturePolicy).toBe(
      "AND('orgb.peer')"
    );
  });

  it("collapses duplicate msp ids in shared policies (no override)", async () => {
    const { shared } = await extractCollections(OtherProductShared, [
      "orgb",
      "orgb",
      MAIN_MSP,
    ]);

    expect(shared).toHaveLength(1);
    expect(shared[0].policy).toBe("OR('orgb.member','orga.member')");
    expect(shared[0].endorsementPolicy?.signaturePolicy).toBe(
      "AND('orgb.peer','orga.peer')"
    );
  });

  it("dedupes both access and endorsement policies in sharedCollectionFor", () => {
    const c = sharedCollectionFor(["orga", "orga", "orgb"], "col-x");

    expect(c.policy).toBe("OR('orga.member','orgb.member')");
    expect(c.endorsementPolicy?.signaturePolicy).toBe(
      "AND('orga.peer','orgb.peer')"
    );
  });
});
