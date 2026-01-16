import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { extractCollections } from "../../src/client/collections/index";
import { Metadata } from "@decaf-ts/decoration";

describe("collection extraction", () => {
  it("extracts collections", () => {
    const clazz = OtherProductShared;

    const meta = Metadata.get(OtherProductShared);

    const collections = extractCollections(clazz, ["main-msp", "org1"]);
    expect(collections).toBeDefined();
  });
});
