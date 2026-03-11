import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherProductImage } from "./models/OtherProductImage";

@Info({
  title: "OtherProductImageContract",
  description: "Contract managing the OtherProductImage",
})
export class OtherProductImageContract extends SerializedCrudContract<OtherProductImage> {
  constructor() {
    super(OtherProductImageContract.name, OtherProductImage);
  }
}
