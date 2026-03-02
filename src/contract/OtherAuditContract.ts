import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherAudit } from "./models/OtherAudit";

@Info({
  title: "OtherAuditContract",
  description: "Contract managing the OtherAudit",
})
export class OtherAuditContract extends SerializedCrudContract<OtherAudit> {
  constructor() {
    super(OtherAuditContract.name, OtherAudit);
  }
}
