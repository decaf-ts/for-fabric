import {
  CouchDBAdapter,
  CouchDBGroupOperator,
  CouchDBKeys,
  CouchDBOperator,
  CouchDBQueryLimit,
  MangoOperator,
  MangoQuery,
  MangoSelector,
} from "@decaf-ts/for-couchdb";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractContext } from "./ContractContext";
import { CouchDBStatement } from "@decaf-ts/for-couchdb";
import {
  Condition,
  ContextualArgs,
  MaybeContextualArg,
  OrderDirection,
  QueryError,
} from "@decaf-ts/core";
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

  protected override build(): MangoQuery {
    const log = this.log.for(this.build);
    this.manualAggregation = undefined;
    const aggregateInfo = this.buildAggregateInfo();
    if (aggregateInfo) {
      if (this.shouldUseManualAggregation()) {
        this.manualAggregation = aggregateInfo;
      } else {
        return this.createAggregateQuery(aggregateInfo);
      }
    }
    const selectors: MangoSelector = {};
    selectors[CouchDBKeys.TABLE] = {};
    selectors[CouchDBKeys.TABLE] = Model.tableName(this.fromSelector);
    const query: MangoQuery = { selector: selectors };
    if (this.selectSelector) query.fields = this.selectSelector as string[];

    if (this.whereCondition) {
      const condition: MangoSelector = this.parseCondition(
        Condition.and(
          this.whereCondition,
          Condition.attribute<M>(CouchDBKeys.TABLE as keyof M).eq(
            query.selector[CouchDBKeys.TABLE]
          )
        )
      ).selector;
      const selectorKeys = Object.keys(condition) as MangoOperator[];
      if (
        selectorKeys.length === 1 &&
        Object.values(CouchDBGroupOperator).indexOf(selectorKeys[0]) !== -1
      )
        switch (selectorKeys[0]) {
          case CouchDBGroupOperator.AND:
            condition[CouchDBGroupOperator.AND] = [
              ...Object.values(
                condition[CouchDBGroupOperator.AND] as MangoSelector
              ).reduce((accum: MangoSelector[], val: any) => {
                const keys = Object.keys(val);
                if (keys.length !== 1)
                  throw new Error(
                    "Too many keys in query selector. should be one"
                  );
                const k = keys[0];
                if (k === CouchDBGroupOperator.AND)
                  accum.push(...(val[k] as any[]));
                else accum.push(val);
                return accum;
              }, []),
            ];
            query.selector = condition;
            break;
          case CouchDBGroupOperator.OR: {
            const s: Record<any, any> = {};
            s[CouchDBGroupOperator.AND] = [
              condition,
              ...Object.entries(query.selector).map(([key, val]) => {
                const result: Record<any, any> = {};
                result[key] = val;
                return result;
              }),
            ];
            query.selector = s;
            break;
          }
          default:
            throw new Error("This should be impossible");
        }
      else {
        Object.entries(condition).forEach(([key, val]) => {
          if (query.selector[key])
            log.warn(
              `A ${key} query param is about to be overridden: ${query.selector[key]} by ${val}`
            );
          query.selector[key] = val;
        });
      }
    }

    if (this.orderBySelectors?.length) {
      query.sort = query.sort || [];
      query.selector = query.selector || ({} as MangoSelector);
      for (const [selectorKey, direction] of this.orderBySelectors) {
        const selector = selectorKey as string;
        const rec: Record<string, OrderDirection> = {};
        rec[selector] = direction as OrderDirection;
        (query.sort as Record<string, OrderDirection>[]).push(rec);
        if (!query.selector[selector]) {
          query.selector[selector] = {} as MangoSelector;
          (query.selector[selector] as MangoSelector)[CouchDBOperator.BIGGER] =
            null;
        }
      }
    }

    const hasManualAggregate = !!this.manualAggregation;
    if (this.limitSelector) {
      query.limit = this.limitSelector;
    } else if (!hasManualAggregate) {
      // log.warn(
      //   `No limit selector defined. Using default couchdb limit of ${CouchDBQueryLimit}`
      // );
      // query.limit = CouchDBQueryLimit;
      // do nothing
    }

    if (this.offsetSelector) query.skip = this.offsetSelector;

    return query;
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
        true,
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
