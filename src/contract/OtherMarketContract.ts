import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { OtherMarket } from "./models/OtherMarket";

@Info({
  title: "OtherMarketContract",
  description: "Contract managing the Product Markets",
})
export class OtherMarketContract extends SerializedCrudContract<OtherMarket> {
  constructor() {
    super(OtherMarketContract.name, OtherMarket);
  }
}
