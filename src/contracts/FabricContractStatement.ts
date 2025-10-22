import { Model } from "@decaf-ts/decorator-validation";
import {
  CouchDBAdapter,
  CouchDBGroupOperator,
  CouchDBKeys,
  CouchDBOperator,
  CouchDBStatement,
  MangoOperator,
  MangoQuery,
  MangoSelector,
} from "@decaf-ts/for-couchdb";
import { FabricContractAdapter } from "./ContractAdapter";
import { findPrimaryKey } from "@decaf-ts/db-decorators";
import { FabricContractContext } from "./ContractContext";
import { Condition, OrderDirection, Repository } from "@decaf-ts/core";

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

  override build(): MangoQuery {
    const selectors: MangoSelector = {};
    selectors[CouchDBKeys.TABLE] = {};
    selectors[CouchDBKeys.TABLE] = Repository.table(this.fromSelector);
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
            console.warn(
              `A ${key} query param is about to be overridden: ${query.selector[key]} by ${val}`
            );
          query.selector[key] = val;
        });
      }
    }

    if (this.orderBySelector) {
      query.sort = query.sort || [];
      query.selector = query.selector || ({} as MangoSelector);
      const [selector, value] = this.orderBySelector as [
        string,
        OrderDirection,
      ];
      const rec: any = {};
      rec[selector] = value;
      (query.sort as any[]).push(rec as any);
      if (!query.selector[selector]) {
        query.selector[selector] = {} as MangoSelector;
        (query.selector[selector] as MangoSelector)[CouchDBOperator.BIGGER] =
          null;
      }
    }

    if (this.limitSelector) query.limit = this.limitSelector;

    if (this.offsetSelector) query.skip = this.offsetSelector;

    return query;
  }
}
