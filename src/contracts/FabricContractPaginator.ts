import {
  MaybeContextualArg,
  PagingError,
  Sequence,
  Context,
} from "@decaf-ts/core";
import { DBKeys } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { FabricContractAdapter } from "./ContractAdapter";
import {
  CouchDBKeys,
  CouchDBPaginator,
  MangoQuery,
} from "@decaf-ts/for-couchdb";
import { FabricContractContext } from "./ContractContext";
import {
  applyMirrorFlags,
  applySegregationFlags,
  extractMspId,
} from "../shared/decorators";

/**
 * @description Paginator for CouchDB query results
 * @summary Implements pagination for CouchDB queries using bookmarks for efficient navigation through result sets
 * @template M - The model type that extends Model
 * @template R - The result type
 * @param {FabricCo<any, any, any>} adapter - The CouchDB adapter
 * @param {MangoQuery} query - The Mango query to paginate
 * @param {number} size - The page size
 * @param {Constructor<M>} clazz - The model constructor
 * @class CouchDBPaginator
 * @example
 * // Example of using CouchDBPaginator
 * const adapter = new MyCouchDBAdapter(scope);
 * const query = { selector: { type: "user" } };
 * const paginator = new CouchDBPaginator(adapter, query, 10, User);
 *
 * // Get the first page
 * const page1 = await paginator.page(1);
 *
 * // Get the next page
 * const page2 = await paginator.page(2);
 */
export class FabricContractPaginator<
  M extends Model,
> extends CouchDBPaginator<M> {
  /**
   * @description Creates a new CouchDBPaginator instance
   * @summary Initializes a paginator for CouchDB query results
   * @param {CouchDBAdapter<any, any, any, any>} adapter - The CouchDB adapter
   * @param {MangoQuery} query - The Mango query to paginate
   * @param {number} size - The page size
   * @param {Constructor<M>} clazz - The model constructor
   */
  constructor(
    adapter: FabricContractAdapter,
    query: MangoQuery,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  /**
   * @description Prepares a query for pagination
   * @summary Modifies the raw query to include pagination parameters
   * @param {MangoQuery} rawStatement - The original Mango query
   * @return {MangoQuery} The prepared query with pagination parameters
   */
  protected override prepare(rawStatement: MangoQuery): MangoQuery {
    const query: MangoQuery = Object.assign({}, rawStatement);
    if (query.limit) this.limit = query.limit;

    query.limit = this.size;

    return query;
  }

  /**
   * @description Retrieves a specific page of results
   * @summary Executes the query with pagination and processes the results
   * @param {number} [page=1] - The page number to retrieve
   * @return {Promise<R[]>} A promise that resolves to an array of results
   * @throws {PagingError} If trying to access a page other than the first without a bookmark, or if no class is defined
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant CouchDBPaginator
   *   participant Adapter
   *   participant CouchDB
   *
   *   Client->>CouchDBPaginator: page(pageNumber)
   *   Note over CouchDBPaginator: Clone statement
   *   CouchDBPaginator->>CouchDBPaginator: validatePage(page)
   *
   *   alt page !== 1
   *     CouchDBPaginator->>CouchDBPaginator: Check bookmark
   *     alt No bookmark
   *       CouchDBPaginator-->>Client: Throw PagingError
   *     else Has bookmark
   *       CouchDBPaginator->>CouchDBPaginator: Add bookmark to statement
   *     end
   *   end
   *
   *   CouchDBPaginator->>Adapter: raw(statement, false)
   *   Adapter->>CouchDB: Execute query
   *   CouchDB-->>Adapter: Return results
   *   Adapter-->>CouchDBPaginator: Return MangoResponse
   *
   *   Note over CouchDBPaginator: Process results
   *
   *   alt Has warning
   *     CouchDBPaginator->>CouchDBPaginator: Log warning
   *   end
   *
   *   CouchDBPaginator->>CouchDBPaginator: Check for clazz
   *
   *   alt No clazz
   *     CouchDBPaginator-->>Client: Throw PagingError
   *   else Has clazz
   *     CouchDBPaginator->>CouchDBPaginator: Find primary key
   *
   *     alt Has fields in statement
   *       CouchDBPaginator->>CouchDBPaginator: Use docs directly
   *     else No fields
   *       CouchDBPaginator->>CouchDBPaginator: Process each document
   *       loop For each document
   *         CouchDBPaginator->>CouchDBPaginator: Extract original ID
   *         CouchDBPaginator->>Adapter: revert(doc, clazz, pkDef.id, parsedId)
   *       end
   *     end
   *
   *     CouchDBPaginator->>CouchDBPaginator: Store bookmark
   *     CouchDBPaginator->>CouchDBPaginator: Update currentPage
   *     CouchDBPaginator-->>Client: Return results
   *   end
   */
  override async page(
    page: number = 1,
    bookmark?: any,
    ...args: MaybeContextualArg<any>
  ): Promise<M[]> {
    const { ctxArgs, ctx } = this.adapter["logCtx"](
      [bookmark, ...args].filter(Boolean),
      this.page
    );
    if (bookmark && bookmark instanceof Context) {
      bookmark = undefined;
    }

    const msp = extractMspId(ctx.identity);
    const { privateCols, sharedCols } = Model.collectionsFor(this.clazz);
    const collections = [
      ...new Set(
        await Promise.all(
          [...privateCols, ...sharedCols].map((c) =>
            typeof c === "string" ? c : c(this.clazz, msp, ctx)
          )
        )
      ),
    ];
    applySegregationFlags(new this.clazz(), collections, ctx);
    await applyMirrorFlags(this.clazz, msp, ctx);

    this._bookmark = bookmark;
    if (this.isPreparedStatement())
      return await this.pagePrepared(page, ...ctxArgs);
    const statement = Object.assign({}, this.statement);

    if ((!this._recordCount || !this._totalPages) && !this._bookmark) {
      await this.computeCounts(statement, ctx);
      if (this._recordCount > 0) {
        if (!bookmark) return await this.page(page, ...ctxArgs);
      } else {
        return [];
      }
    } else if (page === 1) {
      page = this.validatePage(page);
      statement.skip = (page - 1) * this.size;
    }

    if (page !== 1) {
      if (!this._bookmark)
        throw new PagingError("No bookmark. Did you start in the first page?");
      statement["bookmark"] = this._bookmark as string;
    }
    const rawResult = (await this.adapter.raw(statement, false, ctx)) as any;

    const { docs, bookmark: nextBookmark } = rawResult;
    if (!this.clazz) throw new PagingError("No statement target defined");
    const id = Model.pk(this.clazz);
    const type = Metadata.get(
      this.clazz,
      Metadata.key(DBKeys.ID, id as string)
    )?.type;
    const results =
      statement.fields && statement.fields.length
        ? docs // has fields means its not full model
        : docs.map((d: any) => {
            return this.adapter.revert(
              d,
              this.clazz,
              Sequence.parseValue(type, d[id]),
              undefined,
              ctx
            );
          });
    this._bookmark = nextBookmark;
    this._currentPage = page;
    return results;
  }

  private async computeCounts(
    statement: MangoQuery,
    ctx: FabricContractContext
  ): Promise<void> {
    const normalizedStatement: MangoQuery = Object.assign({}, statement);
    delete (normalizedStatement as any).bookmark;
    delete normalizedStatement.skip;
    delete normalizedStatement.limit;
    const nativeTotal = await this.countViaNativePlan(normalizedStatement, ctx);
    const total =
      typeof nativeTotal === "number"
        ? nativeTotal
        : await this.countViaMango(normalizedStatement, ctx);
    this._recordCount = total;
    const size = statement?.limit || this.size;
    this._totalPages = total ? Math.ceil(total / size) : 0;
  }

  private async countViaNativePlan(
    statement: MangoQuery,
    ctx: FabricContractContext
  ): Promise<number | undefined> {
    const adapter = this.adapter as FabricContractAdapter;
    const plan = adapter.nativeIndexPlan?.(statement, ctx);
    if (!plan) return undefined;
    const range = this.buildNativeRangeKeys(plan, ctx);
    if (!range) return undefined;
    if (range.exact) {
      try {
        const data = await ctx.stub.getState(range.startKey);
        return data && data.length ? 1 : 0;
      } catch {
        return 0;
      }
    }
    if (!range.endKey || typeof ctx.stub.getStateByRange !== "function") {
      return undefined;
    }
    const iterator = await ctx.stub.getStateByRange(
      range.startKey,
      range.endKey
    );
    let count = 0;
    try {
      for (
        let res = await iterator.next();
        !res.done;
        res = await iterator.next()
      ) {
        if (res.value) count++;
      }
    } finally {
      if (typeof (iterator as any).close === "function") {
        await iterator.close();
      }
    }
    return count;
  }

  private async countViaMango(
    statement: MangoQuery,
    ctx: FabricContractContext
  ): Promise<number> {
    const countQuery: MangoQuery = Object.assign({}, statement, {
      limit: Number.MAX_SAFE_INTEGER,
    });
    const countResults =
      (await this.adapter.raw<M[], true>(countQuery, true, ctx)) || [];
    return countResults.length;
  }

  private buildNativeRangeKeys(
    plan: ReturnType<FabricContractAdapter["nativeIndexPlan"]>,
    ctx: FabricContractContext
  ):
    | { startKey: string; endKey?: string; exact: boolean }
    | undefined {
    if (!plan?.startkey) return undefined;
    const startInfo = this.parsePlanComponents(plan.startkey);
    const startKey = ctx.stub.createCompositeKey(
      plan.tableName,
      startInfo.components
    );
    if (!plan.endkey) {
      return { startKey, exact: true };
    }
    const endInfo = this.parsePlanComponents(plan.endkey);
    if (plan.endkey === plan.startkey && !endInfo.hasHighSentinel) {
      return { startKey, exact: true };
    }
    const endComponents = endInfo.hasHighSentinel
      ? [...endInfo.components, "\ufff0"]
      : endInfo.components;
    const endKey = ctx.stub.createCompositeKey(plan.tableName, endComponents);
    return { startKey, endKey, exact: false };
  }

  private parsePlanComponents(planKey?: string) {
    if (!planKey)
      return { components: [] as string[], hasHighSentinel: false };
    const parts = planKey.split(CouchDBKeys.SEPARATOR);
    parts.shift();
    const hasHighSentinel =
      parts.length > 0 && parts[parts.length - 1] === "\ufff0";
    const components = hasHighSentinel ? parts.slice(0, -1) : parts;
    return {
      components: components.filter((part) => part.length),
      hasHighSentinel,
    };
  }
}
