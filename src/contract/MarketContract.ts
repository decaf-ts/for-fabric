import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Market } from "./models/Market";

@Info({
  title: "MarketContract",
  description: "Contract managing the Product Markets",
})
export class MarketContract extends SerializedCrudContract<Market> {
  constructor() {
    super(MarketContract.name, Market);
  }
}
