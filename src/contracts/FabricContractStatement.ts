import { CouchDBAdapter } from "@decaf-ts/for-couchdb";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractContext } from "./ContractContext";
import { CouchDBStatement } from "@decaf-ts/for-couchdb";
import { ContextualArgs, MaybeContextualArg, QueryError } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { applySegregationFlags, extractMspId } from "../shared/decorators";

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

  override async execute(
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<R> {
    const { log, ctx, ctxArgs } = this.logCtx(args, this.execute);

    const msp = extractMspId(ctx.identity);

    const { privateCols, sharedCols } = Model.collectionsFor(this.fromSelector);
    const collections = [
      ...new Set(
        await Promise.all(
          [...privateCols, ...sharedCols].map((c) =>
            typeof c === "string" ? c : c(this.fromSelector, msp, ctx)
          )
        )
      ),
    ];

    applySegregationFlags(new this.fromSelector(), collections, ctx);

    try {
      if (this.prepared) return this.executePrepared(...(args as any));
      log.silly(`Building raw statement...`);
      const query = this.build();
      log.silly(`executing raw statement`);
      const results = (await this.raw<R>(
        query,
        ...(ctxArgs as ContextualArgs<FabricContractContext>)
      )) as unknown as R;
      if (this.hasAggregation()) {
        return results;
      }
      if (!this.selectSelector) {
        const pkAttr = Model.pk(this.fromSelector);
        const processor = function recordProcessor(
          this: FabricStatement<M, R>,
          r: any
        ) {
          const id = r[pkAttr];
          return this.adapter.revert(
            r,
            this.fromSelector as Constructor<any>,
            id,
            undefined,
            ctx
          ) as any;
        }.bind(this as any);

        if (this.groupBySelectors?.length) {
          return this.revertGroupedResults(results, processor) as R;
        }
        if (Array.isArray(results)) return results.map(processor) as R;
        return processor(results) as R;
      }
      return results;
    } catch (e: unknown) {
      throw new QueryError(e as Error);
    }
  }
}
