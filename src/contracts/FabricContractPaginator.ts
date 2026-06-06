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
import { CouchDBPaginator, MangoQuery } from "@decaf-ts/for-couchdb";
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

  private hasBookmark(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
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
    page = this.validatePage(page ?? 1);
    statement.limit = this.size;
    if (page === 1) {
      if (this.hasBookmark(bookmark)) {
        statement.bookmark = bookmark;
      } else {
        delete statement.bookmark;
      }
    } else {
      const explicitBookmark = bookmark || this._bookmarks.get(page);
      if (!this.hasBookmark(explicitBookmark)) {
        throw new PagingError(
          "Random page access requires a cached CouchDB bookmark. Start at page 1 and page forward, or pass an explicit bookmark."
        );
      }
      delete statement.skip;
      statement.bookmark = explicitBookmark;
    }
    delete statement.skip;
    const tieBreaker = Model.pk(this.clazz);
    const previousTieBreaker = ctx.getOrUndefined("privatePaginationTieBreaker");
    ctx.put("privatePaginationTieBreaker", tieBreaker);
    let rawResult: any;
    try {
      rawResult = (await this.adapter.raw(statement, false, ctx)) as any;
    } finally {
      ctx.put(
        "privatePaginationTieBreaker",
        previousTieBreaker === undefined ? undefined : previousTieBreaker
      );
    }

    const { docs, bookmark: nextBookmark, warning } = rawResult;
    if (warning) {
      ctx.logger?.warn?.(warning);
    }
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
    const hasNextBookmark =
      this.hasBookmark(nextBookmark) &&
      docs.length > 0 &&
      nextBookmark !== bookmark;
    this._bookmark = hasNextBookmark ? nextBookmark : undefined;
    if (hasNextBookmark) {
      this._bookmarks.set(page + 1, nextBookmark);
      this._totalPages = Math.max(this._totalPages || 0, page + 1);
    }
    this._currentPage = page;
    if (!hasNextBookmark) {
      this._knownLastPage = page;
      this._totalPages = page;
      this._recordCount = (page - 1) * this.size + docs.length;
    }
    return results;
  }
}
