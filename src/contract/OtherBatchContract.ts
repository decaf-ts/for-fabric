import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherBatchShared } from "./models/OtherBatchShared";

@Info({
  title: "OtherBatchContract",
  description: "Contract managing the OtherBatch",
})
export class OtherBatchContract extends SerializedCrudContract<OtherBatchShared> {
  constructor() {
    super(OtherBatchContract.name, OtherBatchShared);
  }
}
