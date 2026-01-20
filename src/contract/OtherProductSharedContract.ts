import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherProductShared } from "./models/OtherProductShared";

@Info({
  title: "OtherProductSharedContract",
  description: "Contract managing the Other Shared Products",
})
export class OtherProductSharedContract extends SerializedCrudContract<OtherProductShared> {
  constructor() {
    super(OtherProductSharedContract.name, OtherProductShared);
  }
}
