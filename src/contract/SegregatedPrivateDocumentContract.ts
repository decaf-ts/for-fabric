import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { SegregatedPrivateDocument } from "./models/SegregatedDocument";

@Info({
  title: "SegregatedPrivateDocumentContract",
  description: "Handles CRUD for documents split across segregated private collections.",
})
export class SegregatedPrivateDocumentContract extends SerializedCrudContract<
  SegregatedPrivateDocument
> {
  constructor() {
    super(
      SegregatedPrivateDocumentContract.name,
      SegregatedPrivateDocument
    );
  }
}
