import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherProduct } from "./models/OtherProduct";

@Info({
  title: "OtherProductContract",
  description: "Contract managing the Products",
})
export class OtherProductContract extends SerializedCrudContract<OtherProduct> {
  constructor() {
    super(OtherProductContract.name, OtherProduct);
  }
}
