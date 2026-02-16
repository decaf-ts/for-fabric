import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherProductStrength } from "./models/OtherProductStrength";

@Info({
  title: "OtherProductStrengthContract",
  description: "Contract managing the Product Strengths",
})
export class OtherProductStrengthContract extends SerializedCrudContract<OtherProductStrength> {
  constructor() {
    super(OtherProductStrengthContract.name, OtherProductStrength);
  }
}
