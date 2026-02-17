import { Model } from "@decaf-ts/decorator-validation";
import { OtherProductShared } from "./src/contract/models/OtherProductShared.ts";
const inst = new OtherProductShared({
  productCode: "p1",
  inventedName: "name",
  nameMedicinalProduct: "med",
  strengths: [{productCode: "p1", strength: "100mg"}],
  markets: [{productCode: "p1", marketId: "us"}]
});
const segregated = Model.segregate(inst);
console.log(JSON.stringify(segregated, null, 2));
