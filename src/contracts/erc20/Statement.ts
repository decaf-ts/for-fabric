import { Model } from "@decaf-ts/decorator-validation";
import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractAdapter } from "../ContractAdapter";
import { findPrimaryKey } from "@decaf-ts/db-decorators";
import { FabricContractContext } from "../ContractContext";
import { CouchDBStatement } from "@decaf-ts/for-couchdb";

export class FabricStatement<M extends Model, R> extends CouchDBStatement<
  M,
  R
> {
  private ctx: FabricContractContext;
  constructor(adapter: FabricContractAdapter, ctx: FabricContractContext) {
    super(adapter as unknown as CouchDBAdapter<any, any, any>);
    this.ctx = ctx;
  }

  override async raw<R>(rawInput: MangoQuery): Promise<R> {
    const results: any[] = await this.adapter.raw(rawInput, true, this.ctx);

    const pkDef = findPrimaryKey(new this.fromSelector());
    const pkAttr = pkDef.id;
    const type = pkDef.props.type;

    if (!this.selectSelector)
      return results.map((r) => this.processRecord(r, pkAttr, type)) as R;
    return results as R;
  }
}
