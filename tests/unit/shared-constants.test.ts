import {
  FabricFlavour,
  FabricModelKeys,
  IdentityType,
} from "../../src/shared/constants";

describe("shared/constants", () => {
  it("exposes fabric model keys", () => {
    expect(FabricModelKeys.PRIVATE).toBe("private");
    expect(FabricModelKeys.FABRIC).toBe("fabric.");
    expect(FabricModelKeys.OWNEDBY).toBe("owned-by");
  });

  it("lists supported identity types", () => {
    expect(IdentityType.X509).toBe("X.509");
  });

  it("provides fabric flavour identifier", () => {
    expect(FabricFlavour).toBe("hlf-fabric");
  });
});
