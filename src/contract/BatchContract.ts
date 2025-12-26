import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Batch } from "./models/Batch";

@Info({
  title: "BatchContract",
  description: "Contract managing the Batch",
})
export class BatchContract extends SerializedCrudContract<Batch> {
  constructor() {
    super(BatchContract.name, Batch);
  }
}
