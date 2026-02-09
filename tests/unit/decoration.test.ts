import { Model } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { Product } from "../../src/contract/models/Product";
import { Audit } from "../../src/contract/models/Audit";

describe("decoration test", () => {
  it("Product is properly decorated", async () => {
    const meta = Metadata.get(Product);
    const p = new Product({
      inventedName: "string",
    });
  });

  it("audit is properly decorated", async () => {
    const props = Metadata.properties(Audit);

    const meta = Metadata.get(Audit);

    const audit = new Audit({
      userGroup: "string",
      userId: "string",
      model: "string",
      action: "string",
      diffs: {},
    });
  });
});
