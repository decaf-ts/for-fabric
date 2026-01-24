import { CouchDBAdapter } from "@decaf-ts/for-couchdb";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractContext } from "./ContractContext";
import { CouchDBStatement } from "@decaf-ts/for-couchdb";
import { MaybeContextualArg } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";

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
  CouchDBAdapter<any, void, FabricContractContext>,
  R
> {
  constructor(adapter: CouchDBAdapter<any, void, FabricContractContext>) {
    super(adapter);
  }

  protected override async executionPrefix(
    method: any,
    ...args: MaybeContextualArg<FabricContractContext>
  ) {
    const newArgs = args.filter(
      Boolean
    ) as MaybeContextualArg<FabricContractContext>;
    if (args.length !== newArgs.length)
      throw new InternalError(
        `Received an undefined in the paginator for ${method}: ${args}`
      );
    return super.executionPrefix(method, ...args);
  }
}
