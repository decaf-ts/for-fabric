import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { SegregatedSharedDocument } from "./models/SegregatedDocument";

@Info({
  title: "SegregatedSharedDocumentContract",
  description: "Handles CRUD for documents split across segregated shared collections.",
})
export class SegregatedSharedDocumentContract extends SerializedCrudContract<
  SegregatedSharedDocument
> {
  constructor() {
    super(
      SegregatedSharedDocumentContract.name,
      SegregatedSharedDocument
    );
  }
}
