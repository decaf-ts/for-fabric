import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Audit } from "./models/Audit";

@Info({
  title: "AuditContract",
  description: "Contract managing the Audit",
})
export class AuditContract extends SerializedCrudContract<Audit> {
  constructor() {
    super(AuditContract.name, Audit);
  }
}
