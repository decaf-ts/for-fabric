import { Model } from "@decaf-ts/decorator-validation";
import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractAdapter } from "./ContractAdapter";
import { findPrimaryKey } from "@decaf-ts/db-decorators";
import { FabricContractContext } from "./ContractContext";
import { CouchDBStatement } from "@decaf-ts/for-couchdb";

/**
 * @description Statement wrapper for executing Mango queries within Fabric contracts
 * @summary Bridges CouchDB-style queries to Fabric via the FabricContractAdapter, handling identity and primary key projection when needed.
 * @template M - Model type this statement operates on
 * @template R - Result type returned by the statement
 * @param {FabricContractAdapter} adapter - The Fabric contract adapter used for raw execution
 * @param {FabricContractContext} ctx - The Fabric contract context carrying stub and identity
 * @return {void}
 * @class FabricStatement
 * @example
 * const stmt = new FabricStatement<MyModel, MyModel[]>(adapter, ctx);
 * const result = await stmt.raw<MyModel[]>({ selector: { type: 'MyModel' } });
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Statement
 *   participant Adapter
 *   participant Ledger
 *   App->>Statement: raw({ selector })
 *   Statement->>Adapter: adapter.raw(mango, true, ctx)
 *   Adapter->>Ledger: Evaluate query
 *   Adapter-->>Statement: rows
 *   Statement-->>App: models
 */
export class FabricStatement<M extends Model, R> extends CouchDBStatement<
  M,
  R
> {
  constructor(
    adapter: FabricContractAdapter,
    private readonly ctx: FabricContractContext
  ) {
    super(adapter as unknown as CouchDBAdapter<any, any, any, any>);
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
