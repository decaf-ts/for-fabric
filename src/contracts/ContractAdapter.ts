import {
  CouchDBAdapter,
  CouchDBKeys,
  MangoQuery,
  ViewResponse,
  requireGeneratedUseIndex,
  ensureDeterministicSort as couchEnsureDeterministicSort,
  getSortDirection,
  getSortFields,
  warnScanProneMangoOperators,
} from "@decaf-ts/for-couchdb";
import { Model, ValidationKeys } from "@decaf-ts/decorator-validation";
import { createHash } from "crypto";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import {
  BadRequestError,
  BaseError,
  BulkCrudOperationKeys,
  ConflictError,
  InternalError,
  NotFoundError,
  onCreate,
  onCreateUpdate,
  OperationKeys,
  PrimaryKeyType,
  SerializationError,
} from "@decaf-ts/db-decorators";
import {
  Context as Ctx,
  Object as FabricObject,
  Property,
  Property as FabricProperty,
} from "fabric-contract-api";
import { Logger, Logging } from "@decaf-ts/logging";
import {
  PersistenceKeys,
  RelationsMetadata,
  SerializedPage,
  Sequence,
  SequenceOptions,
  UnsupportedError,
  Adapter,
  AdapterFlags,
  PreparedModel,
  Repository,
  QueryError,
  PagingError,
  MigrationError,
  ObserverError,
  AuthorizationError,
  ForbiddenError,
  ConnectionError,
  ContextualizedArgs,
  DirectionLimitOffset,
  Context,
  RawResult,
  Paginator,
  ContextualArgs,
  MaybeContextualArg,
  MethodOrOperation,
  AllOperationKeys,
  FlagsOf,
  ContextOf,
  OrderDirection,
  TransactionOperationKeys,
  EventIds,
  Dispatch,
  promiseSequence,
  resolveBulkSequenceResult,
} from "@decaf-ts/core";
import { FabricContractRepository } from "./FabricContractRepository";
import {
  ChaincodeStub,
  ClientIdentity,
  Iterators,
  StateQueryResponse,
} from "fabric-shim-api";
import { FabricStatement } from "./FabricContractStatement";
import { FabricContractSequence } from "./FabricContractSequence";
import { FabricFlavour, FabricModelKeys } from "../shared/constants";
import { SimpleDeterministicSerializer } from "../shared/SimpleDeterministicSerializer";
import {
  apply,
  Constructor,
  Decoration,
  Metadata,
  propMetadata,
} from "@decaf-ts/decoration";
import { FabricContractPaginator } from "./FabricContractPaginator";
import { MissingContextError } from "../shared/errors";
import { SegregatedModel } from "../shared/index";
import { FabricContractDispatch } from "./FabricContractDispatch";

export type FabricContextualizedArgs<
  ARGS extends any[] = any[],
  EXTEND extends boolean = false,
> = ContextualizedArgs<FabricContractContext, ARGS, EXTEND> & {
  stub: ChaincodeStub;
  identity: ClientIdentity;
};

type PrivateSyntheticBookmark = {
  sortField: string;
  direction: "asc" | "desc";
  idField: string;
  lastValue: any;
  lastId: string;
  queryHash: string;
};

/**
 * @description Sets the creator or updater field in a model based on the user in the context
 * @summary Callback function used in decorators to automatically set the created_by or updated_by fields
 * with the username from the context when a document is created or updated
 * @template M - Type extending Model
 * @template R - Type extending NanoRepository<M>
 * @template V - Type extending RelationsMetadata
 * @param {R} this - The repository instance
 * @param {FabricContractContext} context - The operation context containing user information
 * @param {V} data - The relation metadata
 * @param {string} key - The property key to set with the username
 * @param {M} model - The model instance being created or updated
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function createdByOnFabricCreateUpdate
 * @memberOf module:fabric.contracts
 * @mermaid
 * sequenceDiagram
 *   participant F as createdByOnNanoCreateUpdate
 *   participant C as Context
 *   participant M as Model
 *   F->>C: get("user")
 *   C-->>F: user object
 *   F->>M: set key to user.name
 *   Note over F: If no user in context
 *   F-->>F: throw UnsupportedError
 */
export async function createdByOnFabricCreateUpdate<
  M extends Model,
  R extends FabricContractRepository<M>,
  V extends RelationsMetadata,
>(
  this: R,
  context: ContextOf<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  try {
    const user = context.get("identity") as ClientIdentity;
    model[key] = user.getID() as M[typeof key];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    throw new UnsupportedError(
      "No User found in context. Please provide a user in the context"
    );
  }
}

/**
 * @description Adapter for Hyperledger Fabric chaincode state database operations
 * @summary Provides a CouchDB-like interface for interacting with the Fabric state database from within a chaincode contract
 * @template void - No configuration needed for contract adapter
 * @template FabricContractFlags - Flags specific to Fabric contract operations
 * @template FabricContractContext - Context type for Fabric contract operations
 * @class FabricContractAdapter
 * @example
 * ```typescript
 * // In a Fabric chaincode contract class
 * import { FabricContractAdapter } from '@decaf-ts/for-fabric';
 *
 * export class MyContract extends Contract {
 *   private adapter = new FabricContractAdapter();
 *
 *   @Transaction()
 *   async createAsset(ctx: Context, id: string, data: string): Promise<void> {
 *     const model = { id, data, timestamp: Date.now() };
 *     await this.adapter.create('assets', id, model, {}, { stub: ctx.stub });
 *   }
 * }
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Contract
 *   participant FabricContractAdapter
 *   participant Stub
 *   participant StateDB
 *
 *   Contract->>FabricContractAdapter: create(tableName, id, model, transient, ctx)
 *   FabricContractAdapter->>FabricContractAdapter: Serialize model to JSON
 *   FabricContractAdapter->>Stub: putState(id, serializedData)
 *   Stub->>StateDB: Write data
 *   StateDB-->>Stub: Success
 *   Stub-->>FabricContractAdapter: Success
 *   FabricContractAdapter-->>Contract: model
 */
export class FabricContractAdapter extends CouchDBAdapter<
  any,
  void,
  FabricContractContext
> {
  private static readonly PRIVATE_BOOKMARK_PREFIX = "__dcf_pvtbm__";

  private static stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value
        .map((v) => FabricContractAdapter.stableStringify(v))
        .join(",")}]`;
    }

    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${FabricContractAdapter.stableStringify(obj[key])}`
      )
      .join(",")}}`;
  }

  private static toBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) {
      return value;
    }

    if (value instanceof Uint8Array) {
      return Buffer.from(value);
    }

    if (typeof value === "string") {
      return Buffer.from(value, "utf8");
    }

    if (value instanceof ArrayBuffer) {
      return Buffer.from(value);
    }

    if (
      value &&
      typeof value === "object" &&
      "buffer" in value &&
      (value as any).buffer instanceof ArrayBuffer
    ) {
      const typed = value as {
        buffer: ArrayBuffer;
        byteOffset?: number;
        byteLength?: number;
      };

      return Buffer.from(typed.buffer, typed.byteOffset || 0, typed.byteLength);
    }

    throw new SerializationError(
      `Cannot convert private query value to Buffer: ${Object.prototype.toString.call(
        value
      )}`
    );
  }

  private static privateQueryHash(query: Record<string, any>): string {
    const relevant = {
      selector: query.selector || {},
      sort: query.sort || [],
      fields: query.fields || undefined,
      use_index: query.use_index || undefined,
    };

    return createHash("sha256")
      .update(FabricContractAdapter.stableStringify(relevant))
      .digest("base64url");
  }

  private static attachGeneratedPrivateUseIndex(
    query: MangoQuery,
    log?: Logger
  ): void {
    const selector = query.selector as Record<string, any> | undefined;
    const tableName = selector?.[CouchDBKeys.TABLE];
    if (typeof tableName !== "string" || !tableName.length) {
      return;
    }

    let clazz: Constructor<Model> | undefined;
    try {
      clazz = Model.fromTable(tableName) as Constructor<Model>;
    } catch {
      return;
    }

    requireGeneratedUseIndex(clazz, query, log, {
      requireSortCoverage: true,
    });
  }

  private static countSelectorFieldOccurrences(
    selector: unknown,
    counts: Map<string, number> = new Map<string, number>()
  ): Map<string, number> {
    if (!selector || typeof selector !== "object") {
      return counts;
    }

    if (Array.isArray(selector)) {
      for (const entry of selector) {
        FabricContractAdapter.countSelectorFieldOccurrences(entry, counts);
      }
      return counts;
    }

    for (const [key, value] of Object.entries(
      selector as Record<string, any>
    )) {
      if (!["$and", "$or", "$not"].includes(key)) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      if (value && typeof value === "object") {
        FabricContractAdapter.countSelectorFieldOccurrences(value, counts);
      }
    }

    return counts;
  }

  private static isNullLowerBoundMarker(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value as Record<string, any>);
    if (entries.length !== 1) {
      return false;
    }

    const [operator, bound] = entries[0];
    return (operator === "$gt" || operator === "$gte") && bound === null;
  }

  private static normalizeMangoQueryForExecution(
    query: MangoQuery
  ): MangoQuery {
    const normalized: MangoQuery = {
      ...query,
      selector:
        query.selector && typeof query.selector === "object"
          ? { ...(query.selector as Record<string, any>) }
          : query.selector,
    };

    if (!normalized.selector || typeof normalized.selector !== "object") {
      return normalized;
    }

    const counts = FabricContractAdapter.countSelectorFieldOccurrences(
      normalized.selector
    );

    for (const [field, value] of Object.entries(
      normalized.selector as Record<string, any>
    )) {
      if (
        !FabricContractAdapter.isNullLowerBoundMarker(value) ||
        (counts.get(field) || 0) <= 1
      ) {
        continue;
      }

      delete (normalized.selector as Record<string, any>)[field];
    }

    return normalized;
  }

  private static buildPrivateContinuationSelector(
    selector: Record<string, any>,
    sortField: string,
    direction: "asc" | "desc",
    idField: string,
    lastValue: any,
    lastId: string,
    variant: "same" | "next"
  ): Record<string, any> {
    const cmp = direction === "desc" ? "$lt" : "$gt";
    const idCmp = direction === "desc" ? "$lt" : "$gt";

    if (idField === sortField) {
      const continuation = {
        [sortField]: {
          [cmp]: lastValue,
        },
      };

      if (!selector || !Object.keys(selector).length) {
        return continuation;
      }

      return {
        $and: [selector, continuation],
      };
    }

    const clauses =
      variant === "same"
        ? [
            {
              [sortField]: {
                $eq: lastValue,
              },
            },
            {
              [idField]: {
                [idCmp]: lastId,
              },
            },
          ]
        : [
            {
              [sortField]: {
                [cmp]: lastValue,
              },
            },
          ];

    if (!selector || !Object.keys(selector).length) {
      return clauses.length === 1
        ? clauses[0]
        : {
            $and: clauses,
          };
    }

    return {
      $and: [selector, ...clauses],
    };
  }

  private static buildOrlessKeysetContinuationQueries(
    query: MangoQuery,
    cursor: PrivateSyntheticBookmark,
    pageSize: number
  ): MangoQuery[] {
    const baseQuery: Record<string, any> = { ...query };
    delete baseQuery.skip;
    delete baseQuery.bookmark;
    delete baseQuery.limit;

    if (cursor.idField === cursor.sortField) {
      const single: MangoQuery = {
        ...baseQuery,
        selector: FabricContractAdapter.buildPrivateContinuationSelector(
          (baseQuery.selector || {}) as Record<string, any>,
          cursor.sortField,
          cursor.direction,
          cursor.idField,
          cursor.lastValue,
          cursor.lastId,
          "same"
        ) as any,
        limit: pageSize + 1,
      };

      return [single];
    }

    const first: MangoQuery = {
      ...baseQuery,
      selector: FabricContractAdapter.buildPrivateContinuationSelector(
        (baseQuery.selector || {}) as Record<string, any>,
        cursor.sortField,
        cursor.direction,
        cursor.idField,
        cursor.lastValue,
        cursor.lastId,
        "same"
      ) as any,
      limit: pageSize + 1,
    };

    const second: MangoQuery = {
      ...baseQuery,
      selector: FabricContractAdapter.buildPrivateContinuationSelector(
        (baseQuery.selector || {}) as Record<string, any>,
        cursor.sortField,
        cursor.direction,
        cursor.idField,
        cursor.lastValue,
        cursor.lastId,
        "next"
      ) as any,
      limit: pageSize + 1,
    };

    return [first, second];
  }

  private static ensureDeterministicPrivateSort(
    query: MangoQuery,
    tieBreaker: string
  ): {
    sortField: string;
    direction: "asc" | "desc";
    idField: string;
  } {
    if (!Array.isArray(query.sort) || !query.sort.length) {
      throw new PagingError(
        "Private Mango pagination requires an explicit sort. Add orderBy(...) so a stable generated index can be selected."
      );
    }

    const direction = (getSortDirection(query) ||
      OrderDirection.ASC) as OrderDirection;
    couchEnsureDeterministicSort(query, tieBreaker, direction);

    const sortFields = getSortFields(query);
    const sortField = sortFields[0];
    if (!sortField) {
      throw new PagingError(
        "Private Mango pagination requires a valid first sort field."
      );
    }

    if (!sortFields.includes(tieBreaker)) {
      throw new PagingError(
        `Private Mango pagination requires tie-breaker sort field "${tieBreaker}".`
      );
    }

    return {
      sortField,
      direction: direction as "asc" | "desc",
      idField: tieBreaker,
    };
  }

  private static parsePrivateResultValue(value: Buffer): Record<string, any> {
    try {
      const parsed = JSON.parse(value.toString("utf8"));

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Private query result is not a JSON object");
      }

      return parsed as Record<string, any>;
    } catch (e) {
      throw new SerializationError(
        `Failed to parse private query result while building bookmark: ${e}`
      );
    }
  }

  private static async executePrivateMangoPageQueries(
    stub: ChaincodeStub,
    collection: string,
    queries: MangoQuery[],
    pageSize: number,
    log: Logger
  ): Promise<Array<{ key: string; value: Buffer }>> {
    const paged: Array<{ key: string; value: Buffer }> = [];

    for (const q of queries) {
      if (paged.length >= pageSize + 1) {
        break;
      }

      const remaining = pageSize + 1 - paged.length;

      const queryForExecution: MangoQuery = {
        ...q,
        limit: remaining,
      };

      delete queryForExecution.skip;
      delete queryForExecution.bookmark;

      const queryJson = JSON.stringify(queryForExecution);

      log.debug(
        `Querying private collection ${collection} with Mango query: ${queryJson}`
      );

      let response: unknown;

      try {
        response = await stub.getPrivateDataQueryResult(collection, queryJson);
      } catch (e: unknown) {
        log.error(
          [
            `Private Mango paginated query failed`,
            `collection=${collection}`,
            `query=${queryJson}`,
            `error=${e instanceof Error ? e.stack || e.message : String(e)}`,
          ].join("\n")
        );

        throw e;
      }

      const iterator = ((response as any).iterator ||
        response) as Iterators.StateQueryIterator;

      if (!iterator || typeof iterator.next !== "function") {
        throw new QueryError(
          `Private paginated query on collection ${collection} did not return a valid iterator`
        );
      }

      try {
        while (paged.length < pageSize + 1) {
          const res = await iterator.next();

          if (res.done) {
            break;
          }

          if (!res.value || !res.value.value) {
            continue;
          }

          paged.push({
            key: res.value.key as string,
            value: FabricContractAdapter.toBuffer(res.value.value),
          });
        }
      } catch (e: unknown) {
        log.error(
          [
            `Failed while reading private Mango iterator`,
            `collection=${collection}`,
            `query=${queryJson}`,
            `error=${e instanceof Error ? e.stack || e.message : String(e)}`,
          ].join("\n")
        );

        throw e;
      } finally {
        try {
          await iterator.close();
        } catch (e: unknown) {
          log.error(
            [
              `Failed to close private Mango iterator`,
              `collection=${collection}`,
              `query=${queryJson}`,
              `error=${e instanceof Error ? e.stack || e.message : String(e)}`,
            ].join("\n")
          );

          // eslint-disable-next-line no-unsafe-finally
          throw e;
        }
      }
    }

    return paged;
  }

  private static toFabricPaginationResponse(
    docs: Array<{ key: string; value: Buffer }>,
    bookmark: string
  ): {
    iterator: Iterators.StateQueryIterator;
    metadata: {
      fetchedRecordsCount: number;
      bookmark: string;
    };
  } {
    let idx = 0;

    const iterator = {
      async next() {
        if (idx < docs.length) {
          return {
            value: docs[idx++],
            done: false,
          };
        }

        return {
          value: undefined as any,
          done: true,
        };
      },
      async close() {},
    };

    return {
      iterator: iterator as unknown as Iterators.StateQueryIterator,
      metadata: {
        fetchedRecordsCount: docs.length,
        bookmark,
      },
    };
  }

  private static parseSyntheticPrivateBookmark(
    bookmark: unknown
  ): PrivateSyntheticBookmark | undefined {
    if (typeof bookmark !== "string") return undefined;
    if (!bookmark.startsWith(FabricContractAdapter.PRIVATE_BOOKMARK_PREFIX))
      return undefined;
    const raw = bookmark.slice(
      FabricContractAdapter.PRIVATE_BOOKMARK_PREFIX.length
    );
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.sortField !== "string" ||
        typeof parsed.direction !== "string" ||
        typeof parsed.idField !== "string" ||
        typeof parsed.lastId !== "string" ||
        typeof parsed.queryHash !== "string"
      ) {
        return undefined;
      }
      return {
        sortField: parsed.sortField,
        direction: parsed.direction === "desc" ? "desc" : "asc",
        idField: parsed.idField,
        lastValue: (parsed as any).lastValue,
        lastId: parsed.lastId,
        queryHash: parsed.queryHash,
      };
    } catch {
      return undefined;
    }
  }

  private static buildSyntheticPrivateBookmark(cursor: {
    sortField: string;
    direction: "asc" | "desc";
    idField: string;
    lastValue: any;
    lastId: string;
    queryHash: string;
  }): string {
    return `${FabricContractAdapter.PRIVATE_BOOKMARK_PREFIX}${Buffer.from(
      JSON.stringify(cursor)
    ).toString("base64url")}`;
  }

  protected override getClient(): void {
    throw new UnsupportedError("Client is not supported in Fabric contracts");
  }
  /**
   * @description Text decoder for converting binary data to strings
   */
  private static textDecoder = new TextDecoder("utf8");

  protected static readonly serializer = new SimpleDeterministicSerializer();

  /**
   * @description Context constructor for this adapter
   * @summary Overrides the base Context constructor with FabricContractContext
   */
  protected override get Context(): Constructor<FabricContractContext> {
    return FabricContractContext;
  }
  /**
   * @description Gets the repository constructor for this adapter
   * @summary Returns the FabricContractRepository constructor for creating repositories
   * @template M - Type extending Model
   * @return {Constructor<Repository<M, MangoQuery, FabricContractAdapter, FabricContractFlags, FabricContractContext>>} The repository constructor
   */
  override repository<
    R extends Repository<
      any,
      Adapter<any, void, MangoQuery, Context<FabricContractFlags>>
    >,
  >(): Constructor<R> {
    return FabricContractRepository as unknown as Constructor<R>;
  }

  override Paginator<M extends Model>(
    query: MangoQuery,
    size: number,
    clazz: Constructor<M>
  ): Paginator<M, any, MangoQuery> {
    return new FabricContractPaginator(this, query, size, clazz);
  }

  override async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new FabricContractSequence(options, this as any);
  }

  protected override Dispatch(): Dispatch<FabricContractAdapter> {
    return new FabricContractDispatch();
  }

  /**
   * @description Creates a new FabricContractAdapter instance
   * @summary Initializes an adapter for interacting with the Fabric state database
   * @param {void} scope - Not used in this adapter
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(scope: void, alias?: string) {
    super(scope, FabricFlavour, alias);
  }

  override for(config: Partial<any>, ...args: any): typeof this {
    return super.for(config, ...args);
  }

  protected getModelDefaults<M extends Model>(clazz: Constructor<M>) {
    const m = new clazz();
    return (Metadata.properties(clazz) || []).reduce(
      (acc, p) => {
        if (typeof m[p as keyof M] !== "undefined")
          acc[p as keyof M] = m[p as keyof M];
        return acc;
      },
      {} as Record<keyof M, any>
    );
  }

  /**
   * @description Creates a record in the state database
   * @summary Serializes a model and stores it in the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The record data
   * @param {Record<string, any>} transient - Transient data (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the created record
   */
  override async create<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<Context<FabricContractFlags>>
  ): Promise<Record<string, any>> {
    const { ctx, log } = this.logCtx(args, this.create);
    this.enforceMirrorAuthorization(clazz, ctx);
    log.info(`in ADAPTER create with args ${args}`);
    const tableName = Model.tableName(clazz);
    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const mirrorCollection = ctx.get("allowMirroring")
      ? (ctx.getOrUndefined("mirrorCollection") as string | undefined)
      : undefined;
    const fullySegregated =
      ctx.get("allowMirroring") && ctx.isFullySegregated && !mirrorCollection;

    if (!mirrorCollection) {
      let existing: any;
      try {
        existing = await this.readState(composedKey, ctx);
      } catch (e: unknown) {
        // eslint-disable-next-line no-ex-assign
        e = this.parseError(e as Error);
        if (!(e instanceof NotFoundError)) throw e;
      }
      if (existing)
        throw new ConflictError(
          `record with id ${id} in table ${tableName} already exists`
        );
    }

    try {
      log.info(`adding entry to ${tableName} table with pk ${id}`);

      if (mirrorCollection) {
        model = await this.forPrivate(mirrorCollection).putState(
          composedKey,
          model,
          ctx
        );
      } else {
        const defaults = this.getModelDefaults(clazz);
        // handle public data if not fully segregated
        if (!fullySegregated) {
          if (
            Object.keys(model).filter((k) => {
              if (k === CouchDBKeys.TABLE) return false;
              return !(
                defaults &&
                k in defaults &&
                defaults[k as keyof M] === model[k]
              );
            }).length
          )
            model = await this.putState(composedKey, model, ctx);
        }

        // handle segregated writes
        const data = ctx.getFromChildren("segregatedData");
        if (data) {
          for (const collection in data) {
            Object.assign(
              model,
              await this.forPrivate(collection).putState(
                composedKey,
                data[collection][id as any],
                ctx
              )
            );
          }
        }
      }
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  override async createAll<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType[],
    model: Record<string, any>[],
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const { log, ctxArgs } = this.logCtx(args, this.createAll);
    const tableLabel = Model.tableName(tableName);
    log.debug(`Creating ${id.length} entries ${tableLabel} table`);
    return Promise.all(
      id.map((i, count) => this.create(tableName, i, model[count], ...ctxArgs))
    );
  }

  /**
   * @description Reads a record from the state database
   * @summary Retrieves and deserializes a record from the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the retrieved record
   */
  override async read<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<FabricContractFlags>>
  ): Promise<Record<string, any>> {
    const { ctx, log } = this.logCtx(args, this.read);
    log.info(`in ADAPTER read with args ${args}`);
    const tableName = Model.tableName(clazz);

    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const mirrorCollection = this.shouldAllowMirroring(ctx)
      ? (ctx.getOrUndefined("mirrorCollection") as string | undefined)
      : undefined;
    const isMirror =
      this.shouldAllowMirroring(ctx) &&
      (ctx.getOrUndefined("mirror") as boolean | undefined);
    if (isMirror && mirrorCollection) {
      try {
        return await this.forPrivate(mirrorCollection).readState(
          composedKey,
          ctx
        );
      } catch (e: unknown) {
        throw this.parseError(e as Error);
      } finally {
        ctx.put("mirror" as any, undefined);
        ctx.put("mirrorCollection" as any, undefined);
      }
    }

    let model: Record<string, any>;

    try {
      model = ctx.isFullySegregated
        ? {}
        : await this.readState(composedKey, ctx);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    const readCollections = new Set<string>([
      ...(ctx.getReadCollections() || []),
      ...(ctx.consumeReadCollections() || []),
    ]);
    for (const col of readCollections) {
      try {
        Object.assign(
          model,
          await this.forPrivate(col).readState(composedKey, ctx)
        );
      } catch (e: unknown) {
        const parsed = this.parseError(e as Error);
        if (parsed instanceof NotFoundError) continue;
        throw parsed;
      }
    }
    if (!Object.keys(model).length) {
      throw new NotFoundError(
        `record with id ${id} in table ${tableName} does not exist`
      );
    }
    return model;
  }

  /**
   * @description Retrieves multiple records from the database
   * @summary Fetches multiple records with the given IDs from the specified table
   * @param {string} tableName - The name of the table to read from
   * @param id - The identifiers of the records to retrieve
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to an array of retrieved records
   */
  override async readAll<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType[],
    ...args: ContextualArgs<Context<FabricContractFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.readAll);
    const tableName = Model.tableName(clazz);
    log.debug(`Reading ${id.length} entries ${tableName} table`);
    const breakOnSingleFailure = ctx.get("breakOnSingleFailureInBulk") ?? true;
    const continueOnError = !breakOnSingleFailure;

    const mirrorCollection = ctx.get("allowMirroring")
      ? (ctx.getOrUndefined("mirrorCollection") as string | undefined)
      : undefined;
    const isMirror =
      ctx.get("allowMirroring") &&
      (ctx.getOrUndefined("mirror") as boolean | undefined);

    const readMirror = async <M extends Model>(
      clazz: Constructor<M>,
      id: PrimaryKeyType,
      ...args: ContextualArgs<Context<FabricContractFlags>>
    ) => {
      if (!mirrorCollection)
        throw new BadRequestError("Missing mirror collection for mirror read");
      try {
        const { ctx, log } = this.logCtx(args, readMirror);
        log.info(`in ADAPTER read with args ${args}`);
        const tableName = Model.tableName(clazz);

        const composedKey = ctx.stub.createCompositeKey(tableName, [
          String(id),
        ]);

        return await this.forPrivate(mirrorCollection).readState(
          composedKey,
          ctx
        );
      } catch (e: unknown) {
        throw this.parseError(e as Error);
      }
    };

    try {
      const tasks = id.map(
        (i) => () =>
          isMirror && mirrorCollection
            ? readMirror(
                clazz,
                i,
                ...args,
                (ctx as any).override({ noEmitSingle: true })
              )
            : this.read(
                clazz,
                i,
                ...args,
                (ctx as any).override({ noEmitSingle: true })
              )
      );

      const rawResult = continueOnError
        ? await promiseSequence(tasks, true)
        : await promiseSequence(tasks);
      return resolveBulkSequenceResult(
        rawResult,
        continueOnError,
        log,
        BulkCrudOperationKeys.READ_ALL
      );
    } catch (e) {
      throw this.parseError(e as Error);
    } finally {
      ctx.put("mirror" as any, undefined);
      ctx.put("mirrorCollection" as any, undefined);
    }
  }

  /**
   * @description Updates a record in the state database
   * @summary Serializes a model and updates it in the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The updated record data
   * @param {Record<string, any>} transient - Transient data (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the updated record
   */
  override async update<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<Context<FabricContractFlags>>
  ): Promise<Record<string, any>> {
    const { ctx, log } = this.logCtx(args, this.update);

    this.enforceMirrorAuthorization(clazz, ctx);
    log.info(`in ADAPTER update with args ${args}`);
    const tableName = Model.tableName(clazz);
    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const mirrorCollection = this.shouldAllowMirroring(ctx)
      ? (ctx.getOrUndefined("mirrorCollection") as string | undefined)
      : undefined;

    try {
      log.info(`updating entry in ${tableName} table with pk ${id}`);

      if (mirrorCollection) {
        model = await this.forPrivate(mirrorCollection).putState(
          composedKey,
          model,
          ctx
        );
      } else {
        const defaults = this.getModelDefaults(clazz);
        // handle public data
        if (
          Object.keys(model).filter((k) => {
            if (k === CouchDBKeys.TABLE) return false;
            return !(
              defaults &&
              k in defaults &&
              defaults[k as keyof M] === model[k]
            );
          }).length
        )
          model = await this.putState(composedKey, model, ctx);

        // handle segregated writes
        const data = ctx.getFromChildren("segregatedData");
        if (data) {
          for (const collection in data) {
            Object.assign(
              model,
              await this.forPrivate(collection).putState(
                composedKey,
                data[collection][id as any],
                ctx
              )
            );
          }
        }
      }
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  /**
   * @description Deletes a record from the state database
   * @summary Retrieves a record and then removes it from the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier to delete
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the deleted record
   */
  async delete<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<FabricContractFlags>>
  ): Promise<Record<string, any>> {
    const { ctx, log } = this.logCtx(args, this.delete);

    this.enforceMirrorAuthorization(clazz, ctx);
    const tableName = Model.tableName(clazz);

    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const mirrorCollection = this.shouldAllowMirroring(ctx)
      ? (ctx.getOrUndefined("mirrorCollection") as string | undefined)
      : undefined;
    let model: Record<string, any>;

    if (mirrorCollection) {
      try {
        model = await this.forPrivate(mirrorCollection).readState(
          composedKey,
          ctx
        );
        await this.forPrivate(mirrorCollection).deleteState(composedKey, ctx);
      } catch (e: unknown) {
        throw this.parseError(e as Error);
      }
    } else {
      try {
        model = ctx.isFullySegregated
          ? {}
          : await this.readState(composedKey, ctx);
        if (!ctx.isFullySegregated) {
          log.debug(`Deleting entry ${composedKey} from public ledger`);
          await this.deleteState(composedKey, ctx);
        }
      } catch (e: unknown) {
        throw this.parseError(e as Error);
      }

      const collections = ctx.getReadCollections();
      if (collections && collections.length) {
        for (const col of collections) {
          log.debug(
            `ensuring collection ${col} has entry for id ${composedKey} before deleting`
          );
          Object.assign(
            model,
            await this.forPrivate(col).readState(composedKey, ctx)
          );
          log.debug(
            `Deleting private collection ${col} entry for id ${composedKey}`
          );
          await this.forPrivate(col).deleteState(composedKey, ctx);
        }
      }
    }
    return model;
  }

  protected async deleteState(id: string, context: FabricContractContext) {
    await context.stub.deleteState(id);
  }

  forPrivate(collection: string): FabricContractAdapter {
    const toOverride = [
      this.putState,
      this.readState,
      this.deleteState,
      this.queryResult,
      this.queryResultPaginated,
    ].map((fn) => fn.name);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (!toOverride.includes(prop as string))
          return Reflect.get(target, prop, receiver);
        return new Proxy((target as any)[prop], {
          async apply(fn, thisArg, argsList) {
            switch (prop) {
              case "putState": {
                // putState signature: (id: string, model: Record<string, any>, ctx: FabricContractContext)
                const [id, model, ctx] = argsList;
                const log = ctx.logger.for(prop);
                log.debug(
                  `Private write to ${collection} for ${id.toString()}`
                );
                const data = Buffer.from(
                  FabricContractAdapter.serializer.serialize(
                    model as Model,
                    false
                  )
                );
                await ctx.stub.putPrivateData(collection, id.toString(), data);
                return model;
              }
              case "deleteState": {
                // deleteState signature: (id: string, context: FabricContractContext)
                const [id, ctx] = argsList;
                const log = ctx.logger.for(prop);
                log.debug(
                  `Private delete on ${collection} for ${id.toString()}`
                );
                await ctx.stub.deletePrivateData(collection, id.toString());
                return;
              }
              case "readState": {
                // readState signature: (id: string, ctx: FabricContractContext)
                const [id, ctx] = argsList;
                const log = ctx.logger.for(prop);
                log.debug(
                  `Private read from ${collection} for ${id.toString()}`
                );
                const data = await ctx.stub.getPrivateData(collection, id);
                if (!data || !data.toString().length)
                  throw new NotFoundError(`Record with id ${id} not found`);
                try {
                  return FabricContractAdapter.serializer.deserialize(
                    data.toString("utf8")
                  );
                } catch {
                  return data.toString("utf8");
                }
              }
              case "queryResult": {
                const [stub, rawInput, ...args] = argsList;
                const { log } = thisArg["logCtx"](args, prop);

                const normalizedInput =
                  FabricContractAdapter.normalizeMangoQueryForExecution(
                    rawInput
                  );

                const queryJson = JSON.stringify(normalizedInput);

                log.debug(
                  `Querying private collection ${collection} with Mango query: ${queryJson}`
                );

                try {
                  const res = await (
                    stub as ChaincodeStub
                  ).getPrivateDataQueryResult(collection, queryJson);

                  const iterator = (res as any).iterator || res;

                  if (!iterator || typeof iterator.next !== "function") {
                    throw new QueryError(
                      `Private query on collection ${collection} did not return a valid iterator`
                    );
                  }

                  return iterator;
                } catch (e: unknown) {
                  log.error(
                    [
                      `Private Mango query failed`,
                      `collection=${collection}`,
                      `query=${queryJson}`,
                      `error=${e instanceof Error ? e.stack || e.message : String(e)}`,
                    ].join("\n")
                  );

                  throw thisArg.parseError ? thisArg.parseError(e as Error) : e;
                }
              }
              case "queryResultPaginated": {
                const [stub, rawInput, limit, skip, bookmark, ...args] =
                  argsList;
                const { log, ctx } = thisArg["logCtx"](args, prop);
                if (skip !== undefined && skip !== null && Number(skip) > 0) {
                  throw new PagingError(
                    "Private Mango pagination does not support skip/offset pagination. Use the returned synthetic bookmark instead."
                  );
                }

                const pageSize = Math.max(1, Number(limit) || 250);
                const query = { ...rawInput } as MangoQuery;
                const queryInput = query as Record<string, any>;
                const queryPkField =
                  typeof queryInput["__pkField"] === "string" &&
                  queryInput["__pkField"].trim().length
                    ? String(queryInput["__pkField"])
                    : String(
                        ctx?.getOrUndefined("privatePaginationTieBreaker") ||
                          "id"
                      );
                delete queryInput["__pkField"];

                const syntheticCursor =
                  FabricContractAdapter.parseSyntheticPrivateBookmark(bookmark);

                if (
                  bookmark !== undefined &&
                  bookmark !== null &&
                  bookmark !== "" &&
                  !syntheticCursor
                ) {
                  throw new PagingError(
                    "Private Mango pagination only supports adapter-generated synthetic bookmarks."
                  );
                }

                if (!Array.isArray(query.sort) || !query.sort.length) {
                  throw new PagingError(
                    "Private Mango pagination requires an explicit sort. Add orderBy(...) so a stable generated index can be selected."
                  );
                }

                const {
                  sortField,
                  direction: sortDirection,
                  idField,
                } = FabricContractAdapter.ensureDeterministicPrivateSort(
                  query,
                  queryPkField
                );

                warnScanProneMangoOperators(query.selector || {}, log);

                const normalizedQuery =
                  FabricContractAdapter.normalizeMangoQueryForExecution(query);
                FabricContractAdapter.attachGeneratedPrivateUseIndex(
                  normalizedQuery,
                  log
                );

                log.debug(
                  `Private paginated query input collection=${collection} limit=${limit} skip=${skip} bookmark=${bookmark} sortField=${sortField} direction=${sortDirection} synthetic=${Boolean(
                    syntheticCursor
                  )}`
                );

                normalizedQuery.limit = pageSize + 1;

                const queryHash =
                  FabricContractAdapter.privateQueryHash(normalizedQuery);
                if (syntheticCursor) {
                  if (syntheticCursor.queryHash !== queryHash) {
                    throw new PagingError(
                      "Private Mango bookmark does not match the current query."
                    );
                  }
                }

                const queries = syntheticCursor
                  ? FabricContractAdapter.buildOrlessKeysetContinuationQueries(
                      normalizedQuery,
                      syntheticCursor,
                      pageSize
                    )
                  : [{ ...normalizedQuery, limit: pageSize + 1 } as MangoQuery];

                const paged =
                  await FabricContractAdapter.executePrivateMangoPageQueries(
                    stub as ChaincodeStub,
                    collection,
                    queries,
                    pageSize,
                    log
                  );

                const hasMore = paged.length > pageSize;
                const docs = hasMore ? paged.slice(0, pageSize) : paged;

                let nextBookmark = "";
                if (hasMore && docs.length) {
                  const last = docs[docs.length - 1];
                  const lastDoc = FabricContractAdapter.parsePrivateResultValue(
                    last.value
                  );

                  if (!(sortField in lastDoc)) {
                    throw new PagingError(
                      `Cannot build private pagination bookmark: sorted field "${sortField}" is missing from the last result`
                    );
                  }

                  const lastIdValue = lastDoc[idField];
                  if (lastIdValue === undefined || lastIdValue === null) {
                    throw new PagingError(
                      `Cannot build private pagination bookmark: id field "${idField}" is missing from the last result`
                    );
                  }

                  nextBookmark =
                    FabricContractAdapter.buildSyntheticPrivateBookmark({
                      sortField,
                      direction: sortDirection,
                      idField,
                      lastValue: lastDoc[sortField],
                      lastId: String(lastIdValue),
                      queryHash,
                    });
                }

                return FabricContractAdapter.toFabricPaginationResponse(
                  docs,
                  nextBookmark
                );
              }
              default:
                throw new InternalError(
                  `Unsupported method override ${String(prop)}`
                );
            }
          },
        });
      },
    });
  }

  protected async putState(
    id: string,
    model: Record<string, any>,
    ctx: FabricContractContext
  ) {
    let data: Buffer;

    try {
      data = Buffer.from(
        FabricContractAdapter.serializer.serialize(model as Model, false)
      );
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id}: ${e}`
      );
    }
    await ctx.stub.putState(id.toString(), data);

    return model;
  }

  protected async readState(id: string, ctx: FabricContractContext) {
    let result: any;

    const { log } = this.logCtx([ctx], this.readState);
    const res = (await ctx.stub.getState(id.toString())).toString();
    if (!res) throw new NotFoundError(`Record with id ${id} not found`);
    log.silly(`state retrieved under id ${id}`);
    try {
      result = FabricContractAdapter.serializer.deserialize(res.toString());
    } catch (e: unknown) {
      throw new SerializationError(`Failed to parse record: ${e}`);
    }

    return result;
  }

  protected async queryResult(
    stub: ChaincodeStub,
    rawInput: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<Iterators.StateQueryIterator> {
    const normalizedInput =
      FabricContractAdapter.normalizeMangoQueryForExecution(rawInput);
    FabricContractAdapter.attachGeneratedPrivateUseIndex(normalizedInput);
    return stub.getQueryResult(JSON.stringify(normalizedInput));
  }

  protected async queryResultPaginated(
    stub: ChaincodeStub,
    rawInput: any,
    limit: number = 250,
    page?: number,
    bookmark?: string | number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<StateQueryResponse<Iterators.StateQueryIterator>> {
    const normalizedInput =
      FabricContractAdapter.normalizeMangoQueryForExecution(rawInput);
    FabricContractAdapter.attachGeneratedPrivateUseIndex(normalizedInput);
    return stub.getQueryResultWithPagination(
      JSON.stringify(normalizedInput),
      limit,
      bookmark?.toString()
    );
  }

  /**
   * @description Decodes binary data to string
   * @summary Converts a Uint8Array to a string using UTF-8 encoding
   * @param {Uint8Array} buffer - The binary data to decode
   * @return {string} The decoded string
   */
  protected decode(buffer: Uint8Array) {
    return FabricContractAdapter.textDecoder.decode(buffer);
  }

  /**
   * @description Creates operation flags for Fabric contract operations
   * @summary Merges default flags with Fabric-specific context information
   * @template M - Type extending Model
   * @param {OperationKeys} operation - The operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<FabricContractFlags>} flags - Partial flags to merge with defaults
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {FabricContractFlags} The merged flags
   */
  protected override async flags<M extends Model>(
    operation: AllOperationKeys,
    model: Constructor<M> | undefined,
    flags: Partial<FabricContractFlags> | FabricContractContext | Ctx | any
  ): Promise<FabricContractFlags> {
    let baseFlags = {
      segregated: false,
      rebuildWithTransient: false,
      fullySegregated: false,
      allowMirroring:
        (flags as Partial<FabricContractFlags>)?.allowMirroring ?? true,
      strictPrivateMangoPagination: true,
      privatePaginationTieBreaker: "id",
    };
    if (flags instanceof FabricContractContext || flags instanceof Context) {
      flags = flags.toOverrides();
    }

    baseFlags = Object.assign(baseFlags, flags);
    const stubFromFlags =
      (flags as FabricContractContext).stub || (flags as Ctx).stub;
    const identityFromFlags =
      (flags as FabricContractContext).identity ||
      (flags as Ctx).clientIdentity;
    if (stubFromFlags && identityFromFlags) {
      const txId = stubFromFlags.getTxID();
      Object.assign(baseFlags, {
        stub: stubFromFlags,
        identity: identityFromFlags,
        cert: identityFromFlags.getIDBytes().toString(),
        roles: identityFromFlags.getAttributeValue("roles"),
        logger: Logging.for(
          operation,
          {
            logLevel: false,
            timestamp: false,
            correlationId: txId,
          },
          flags
        ),
        correlationId: txId,
      });
    } else {
      baseFlags = Object.assign(baseFlags, flags || {});
    }

    return (await super.flags(
      operation,
      model,
      baseFlags as any
    )) as FabricContractFlags;
  }

  /**
   * @description Creates an index for a model
   * @summary This method is not implemented for Fabric contracts and returns a resolved promise
   * @template M - Type extending Model
   * @param {Constructor<M>} models - The model constructor
   * @return {Promise<void>} Promise that resolves immediately
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected index<M>(models: Constructor<M>): Promise<void> {
    return Promise.resolve(undefined);
  }

  /**
   * @description Processes results from a state query iterator
   * @summary Iterates through query results and converts them to a structured format
   * @param {Logger} log - Logger instance for debugging
   * @param {Iterators.StateQueryIterator} iterator - The state query iterator
   * @param {boolean} [isHistory=false] - Whether this is a history query
   * @return {Promise<any[]>} Promise resolving to an array of processed results
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant ResultIterator
   *   participant Iterator
   *
   *   Caller->>ResultIterator: resultIterator(log, iterator, isHistory)
   *   loop Until done
   *     ResultIterator->>Iterator: next()
   *     Iterator-->>ResultIterator: { value, done }
   *     alt Has value
   *       ResultIterator->>ResultIterator: Process value based on isHistory
   *       ResultIterator->>ResultIterator: Add to results array
   *     end
   *   end
   *   ResultIterator->>Iterator: close()
   *   ResultIterator-->>Caller: allResults
   */
  protected async resultIterator(
    log: Logger,
    iterator: Iterators.StateQueryIterator,
    isHistory = false
  ) {
    const allResults = [];
    let res: { value: any; done: boolean } = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value.toString()) {
        let jsonRes: any = {};
        log.debug(res.value.value.toString("utf8"));
        if (isHistory /* && isHistory === true*/) {
          jsonRes.TxId = res.value.txId;
          jsonRes.Timestamp = res.value.timestamp;
          try {
            jsonRes.Value = JSON.parse(res.value.value.toString("utf8"));
          } catch (err: any) {
            log.error(err);
            jsonRes.Value = res.value.value.toString("utf8");
          }
        } else {
          try {
            jsonRes = JSON.parse(res.value.value.toString("utf8"));
          } catch (err: any) {
            log.error(err);
            jsonRes = res.value.value.toString("utf8");
          }
        }
        allResults.push(jsonRes);
      }
      res = await iterator.next();
    }
    log.debug(`Closing iterator after ${allResults.length} results`);
    await iterator.close();
    return allResults;
  }

  /**
   * @description Executes a raw query against the state database
   * @summary Performs a rich query using CouchDB syntax against the Fabric state database
   * @template R - The return type
   * @param {MangoQuery} rawInput - The Mango Query to execute
   * @param {boolean} docsOnly - Whether to return only documents (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<R>} Promise resolving to the query results
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant FabricContractAdapter
   *   participant Stub
   *   participant StateDB
   *
   *   Caller->>FabricContractAdapter: raw(rawInput, docsOnly, ctx)
   *   FabricContractAdapter->>FabricContractAdapter: Extract limit and skip
   *   alt With pagination
   *     FabricContractAdapter->>Stub: getQueryResultWithPagination(query, limit, skip)
   *   else Without pagination
   *     FabricContractAdapter->>Stub: getQueryResult(query)
   *   end
   *   Stub->>StateDB: Execute query
   *   StateDB-->>Stub: Iterator
   *   Stub-->>FabricContractAdapter: Iterator
   *   FabricContractAdapter->>FabricContractAdapter: resultIterator(log, iterator)
   *   FabricContractAdapter-->>Caller: results
   */
  async raw<R, D extends boolean>(
    rawInput: MangoQuery,
    docsOnly: D = true as D,
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<RawResult<R, D>> {
    const { log, ctx, ctxArgs } = this.logCtx(args, this.raw);

    const enableSegregates = !args.length || args[0] !== true;
    const fullySegregated = enableSegregates && ctx.isFullySegregated;

    const originalInput = { ...(rawInput as Record<string, any>) };
    const { skip, limit } = originalInput;
    const bookmark = originalInput["bookmark"];
    const hasSort =
      Array.isArray((originalInput as Record<string, any>).sort) &&
      (originalInput as Record<string, any>).sort.length > 0;
    const pkField =
      typeof originalInput["__pkField"] === "string" &&
      originalInput["__pkField"].trim().length
        ? String(originalInput["__pkField"])
        : String(ctx?.getOrUndefined("privatePaginationTieBreaker") || "id");
    const hasSkip = skip !== undefined && skip !== null && Number(skip) > 0;
    const hasBookmark =
      bookmark !== undefined && bookmark !== null && bookmark !== "";
    const paginationActive = Boolean(limit || hasSkip || hasBookmark);
    const shouldPaginate = Boolean(
      paginationActive &&
      (enableSegregates || hasSkip || hasBookmark || hasSort)
    );
    const baseInput: Record<string, any> = { ...originalInput };
    delete baseInput["skip"];
    delete baseInput["bookmark"];
    delete baseInput["__pkField"];
    let resp = { docs: [], bookmark: undefined as string | undefined };
    log.debug(
      `raw query start fullySegregated=${fullySegregated} enableSegregates=${enableSegregates} paginationActive=${paginationActive} limit=${limit} skip=${skip} bookmark=${bookmark} pkField=${pkField} query=${JSON.stringify(
        originalInput
      )}`
    );

    // Query public state only when the model is NOT fully segregated
    if (!fullySegregated) {
      let iterator: Iterators.StateQueryIterator;
      if (shouldPaginate) {
        const paginatedInput: Record<string, any> = { ...baseInput };
        delete paginatedInput["limit"];
        log.debug(
          `Retrieving public paginated iterator: limit: ${limit}/ skip: ${skip} bookmark=${bookmark}`
        );
        const response: StateQueryResponse<Iterators.StateQueryIterator> =
          (await this.queryResultPaginated(
            ctx.stub,
            paginatedInput,
            limit || 250,
            (skip as any)?.toString(),
            bookmark,
            ...[ctx as FabricContractContext]
          )) as StateQueryResponse<Iterators.StateQueryIterator>;
        resp.bookmark = response.metadata.bookmark;
        iterator = response.iterator;
        log.debug(`Retrieved public paging iterator`);
        log.debug(
          `public paginated response bookmark=${resp.bookmark} query=${JSON.stringify(
            paginatedInput
          )}`
        );
      } else {
        log.debug("Retrieving listing public iterator");
        iterator = (await this.queryResult(
          ctx.stub,
          { ...baseInput },
          ctx
        )) as Iterators.StateQueryIterator;
      }
      log.debug(`Retrieved public listing iterator`);

      resp.docs = (await this.resultIterator(log, iterator)) as any;
      log.debug(
        `returning ${Array.isArray(resp.docs) ? resp.docs.length : 1} results`
      );
    } else {
      log.debug("Skipping public state query (fully segregated model)");
    }

    const collections = enableSegregates ? ctx.getReadCollections() : undefined;
    log.debug(
      `read collections for raw query: ${JSON.stringify(collections || [])}`
    );

    if (collections && collections.length) {
      // Build a fresh input with limit/skip/bookmark restored
      const segregatedInput = { ...baseInput };
      if (limit) segregatedInput.limit = limit;
      if (skip) segregatedInput.skip = skip;
      if (bookmark) segregatedInput["bookmark"] = bookmark;
      log.debug(
        `segregated input prepared: ${JSON.stringify(segregatedInput)}`
      );

      const segregated: any[] = [];
      for (const collection of collections) {
        log.debug(`Querying from ${collection}`);
        const fromCols = await this.forPrivate(collection).raw(
          { ...segregatedInput } as MangoQuery,
          false,
          true,
          ...ctxArgs
        );
        log.verbose(
          `received ${(fromCols as unknown as any[]).length} from ${collection}`
        );
        segregated.push(fromCols);
      }
      // Prefer the response with the most results so mixed and fully segregated
      // reads return the collection that actually matched the query.
      resp = segregated.reduce((acc, curr) => {
        if (!acc) return curr;
        if (curr.docs && curr.docs.length >= acc?.docs.length) return curr;
        return acc;
      }, resp);
      log.debug(
        `segregated query resolved docs=${Array.isArray(resp.docs) ? resp.docs.length : 0} bookmark=${resp.bookmark}`
      );
    }

    if (docsOnly) {
      log.debug(
        `raw query returning docsOnly=${docsOnly} docs=${Array.isArray(resp.docs) ? resp.docs.length : 0}`
      );
      return resp.docs as any;
    }
    log.debug(
      `raw query returning docs/bookmark docs=${Array.isArray(resp.docs) ? resp.docs.length : 0} bookmark=${resp.bookmark}`
    );
    return resp as any;
  }

  /**
   * @description Lists all records of a model using range queries (deterministic, write-safe)
   * @summary Iterates records via `getStateByPartialCompositeKey` (public) and
   * `getPrivateDataByPartialCompositeKey` (private/shared), following the same collection-routing
   * logic as `raw()` but using Fabric range queries instead of Mango selectors.
   * Unlike `raw()`, this method is safe to use in the same transaction as writes because
   * range queries are deterministic and do not block subsequent `putState`/`putPrivateData` calls.
   * @template M - Type extending Model
   * @param {Constructor<M>} clazz - The model constructor
   * @param {string[]} [attributes=[]] - Partial composite key attributes to filter by (empty = all records)
   * @param {...ContextualArgs<FabricContractContext>} args - Contextual arguments including the chaincode context
   * @return {Promise<M[]>} Promise resolving to an array of reconstructed model instances
   */
  async rangeList<M extends Model>(
    clazz: Constructor<M>,
    attributes: string[] = [],
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<M[]> {
    const { ctx, log } = this.logCtx(args, this.rangeList);
    const tableName = Model.tableName(clazz);
    const fullySegregated = ctx.isFullySegregated;

    const deserializeEntry = (
      raw: Uint8Array
    ): Record<string, any> | undefined => {
      const str = Buffer.from(raw).toString("utf8");
      if (!str) return undefined;
      try {
        return FabricContractAdapter.serializer.deserialize(str) as Record<
          string,
          any
        >;
      } catch {
        try {
          return JSON.parse(str) as Record<string, any>;
        } catch {
          return undefined;
        }
      }
    };

    // Collect raw data keyed by composite key, merging public + private in order (same as read())
    const rawByKey = new Map<string, Record<string, any>>();

    if (!fullySegregated) {
      log.debug(
        `rangeList public: objectType=${tableName} attributes=${JSON.stringify(attributes)}`
      );
      const iterator = await ctx.stub.getStateByPartialCompositeKey(
        tableName,
        attributes
      );
      let next = await iterator.next();
      while (!next.done) {
        if (next.value?.value) {
          const data = deserializeEntry(next.value.value);
          if (data) rawByKey.set(next.value.key, data);
        }
        next = await iterator.next();
      }
      await iterator.close();
      log.debug(`rangeList public: ${rawByKey.size} entries`);
    }

    const collections = ctx.getReadCollections();
    if (collections?.length) {
      for (const collection of collections) {
        log.debug(
          `rangeList private: collection=${collection} objectType=${tableName} attributes=${JSON.stringify(attributes)}`
        );
        const iterator = await ctx.stub.getPrivateDataByPartialCompositeKey(
          collection,
          tableName,
          attributes
        );
        let count = 0;
        let next = await iterator.next();
        while (!next.done) {
          if (next.value?.value) {
            const data = deserializeEntry(next.value.value);
            if (data) {
              const existing = rawByKey.get(next.value.key);
              if (existing) {
                Object.assign(existing, data);
              } else {
                rawByKey.set(next.value.key, data);
              }
              count++;
            }
          }
          next = await iterator.next();
        }
        await iterator.close();
        log.debug(
          `rangeList private: collection=${collection} ${count} entries`
        );
      }
    }

    const results: M[] = [];
    for (const [compositeKey, data] of rawByKey) {
      try {
        const { attributes: keyParts } =
          ctx.stub.splitCompositeKey(compositeKey);
        const id = keyParts[0];
        if (!id) continue;
        results.push(this.revert(data, clazz, id, undefined, ctx));
      } catch (e: unknown) {
        log.warn(
          `rangeList: skipping entry ${compositeKey}: ${e instanceof Error ? e.message : e}`
        );
      }
    }

    log.debug(`rangeList: returning ${results.length} ${clazz.name} instances`);
    return results;
  }

  async paginateByPrimaryKeyRange<M extends Model>(
    clazz: Constructor<M>,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction">,
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<SerializedPage<M>> {
    const { ctx, log } = this.logCtx(args, this.paginateByPrimaryKeyRange);
    const limit = ref.limit || 10;
    const offset = ref.offset || 1;
    const bookmark =
      typeof ref.bookmark === "string"
        ? ref.bookmark
        : ref.bookmark != null
          ? `${ref.bookmark}`
          : undefined;
    const tableName = Model.tableName(clazz);
    const keyPrefix = ctx.stub.createCompositeKey(tableName, []);
    const rangeEnd = `${keyPrefix}\uffff`;
    const rows = new Map<string, Record<string, any>>();
    const maxRowsToRead = limit + 1;

    const deserializeEntry = (
      raw: Uint8Array
    ): Record<string, any> | undefined => {
      const str = Buffer.from(raw).toString("utf8");
      if (!str) return undefined;
      try {
        return JSON.parse(str) as Record<string, any>;
      } catch {
        return undefined;
      }
    };

    const mergeIterator = async (
      iterator: any,
      options?: { skipKey?: string }
    ) => {
      let read = 0;
      try {
        let next = await iterator.next();
        while (!next.done && read < maxRowsToRead) {
          if (next.value?.value) {
            const data = deserializeEntry(next.value.value);
            if (data) {
              const key = next.value.key as string;
              if (options?.skipKey && key === options.skipKey) {
                next = await iterator.next();
                continue;
              }
              const existing = rows.get(key);
              if (existing) {
                Object.assign(existing, data);
              } else {
                rows.set(key, data);
              }
              read++;
            }
          }
          next = await iterator.next();
        }
      } finally {
        if (iterator && typeof iterator.close === "function") {
          await iterator.close();
        }
      }
    };

    log.debug(
      `range pagination start table=${tableName} prefix=${keyPrefix} end=${rangeEnd} order=${order} bookmark=${bookmark} limit=${limit} offset=${offset}`
    );

    if (!ctx.isFullySegregated) {
      log.debug(`range pagination reading public state for ${tableName}`);
      await mergeIterator(await ctx.stub.getStateByRange(keyPrefix, rangeEnd), {
        skipKey: bookmark,
      });
    } else {
      log.debug(
        `range pagination skipping public state because model is fully segregated`
      );
    }

    const readCollections = [...new Set(ctx.getReadCollections() || [])];
    for (const collection of readCollections) {
      log.debug(
        `range pagination reading private collection ${collection} for ${tableName}`
      );
      await mergeIterator(
        await ctx.stub.getPrivateDataByRange(collection, keyPrefix, rangeEnd),
        {
          skipKey: bookmark,
        }
      );
    }

    const compare = (a: string, b: string) =>
      order === OrderDirection.DSC ? b.localeCompare(a) : a.localeCompare(b);
    const sorted = [...rows.entries()].sort(([a], [b]) => compare(a, b));
    const pageEntries = sorted.slice(0, limit);
    const hasNext = sorted.length > limit;
    const data = pageEntries
      .map(([compositeKey, record]) => {
        try {
          const { attributes } = ctx.stub.splitCompositeKey(compositeKey);
          const id = attributes[0];
          if (!id) return undefined;
          return this.revert(record, clazz, id, undefined, ctx);
        } catch (e: unknown) {
          log.warn(
            `range pagination skipping entry ${compositeKey}: ${e instanceof Error ? e.message : e}`
          );
          return undefined;
        }
      })
      .filter((m): m is M => !!m);

    const serialization: SerializedPage<M> = {
      current: offset,
      total: hasNext ? offset + 1 : offset,
      count: data.length,
      data,
      bookmark:
        hasNext && pageEntries.length
          ? pageEntries[pageEntries.length - 1][0]
          : undefined,
    };
    log.debug(
      `range pagination resolved table=${tableName} current=${serialization.current} total=${serialization.total} count=${serialization.count} bookmark=${serialization.bookmark}`
    );
    return serialization;
  }

  async view<R>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ddoc: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    viewName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ..._args: ContextualArgs<FabricContractContext>
  ): Promise<ViewResponse<R>> {
    throw new UnsupportedError(
      "Fabric contracts do not support CouchDB views."
    );
  }

  override Statement<M extends Model>(
    overrides?: Partial<AdapterFlags>
  ): FabricStatement<M, any> {
    return new FabricStatement(this as any, overrides);
  }

  override async updateAll<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType[],
    model: Record<string, any>[],
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const { log, ctxArgs } = this.logCtx(args, this.updateAll);
    const tableLabel = Model.tableName(tableName);
    log.debug(`Updating ${id.length} entries ${tableLabel} table`);
    return Promise.all(
      id.map((i, count) => this.update(tableName, i, model[count], ...ctxArgs))
    );
  }

  /**
   *
   * @param model
   * @param {string} pk
   * @param args
   */
  override prepare<M extends Model>(
    model: M,
    ...args: ContextualArgs<FabricContractContext>
  ): PreparedModel & {
    segregated?: Record<string, Record<string, any>>;
  } {
    const { log, ctx } = this.logCtx(args, this.prepare);
    const split: SegregatedModel<M> = Model.segregate(model);
    const tableName = Model.tableName(model.constructor as any);
    const pk = Model.pk(model.constructor as any);
    const id = model[pk as keyof M];

    const isMirror =
      this.shouldAllowMirroring(ctx) &&
      (ctx.getOrUndefined("mirror") as boolean | undefined);

    const mapToRecord = function (
      this: FabricContractAdapter,
      obj: Record<string, any>,
      keysOverride?: string[]
    ) {
      if (keysOverride)
        keysOverride = [...new Set([...keysOverride, pk as string])];
      const result = Object.entries(obj).reduce(
        (accum: Record<string, any>, [key, val]) => {
          if (typeof val === "undefined") return accum;
          if (keysOverride && !keysOverride.includes(key)) return accum;
          const mappedProp = Model.columnName(model, key as any);
          if (this.isReserved(mappedProp))
            throw new InternalError(`Property name ${mappedProp} is reserved`);
          val = val instanceof Date ? new Date(val) : val;
          accum[mappedProp] = val;
          return accum;
        },
        {}
      );
      if (Object.keys(result).filter((k) => Boolean(result[k])).length) {
        // Add table identifier
        result[CouchDBKeys.TABLE] = tableName;
      }
      return result;
    }.bind(this);

    log.silly(
      `Preparing record for ${tableName} table with pk ${(model as any)[pk]}`
    );

    const segregatedWriteKeys = ctx.getSegregatedWrites();
    const segregatedWrites: Record<string, any> = {};
    // Only apply segregated writes when the current model actually has a transient split.
    // The same FabricContractContext can be reused across nested operations (for example
    // sequence upserts during persistent version generation). In those cases, we must not
    // attempt to apply parent-model segregated write keys to unrelated models.
    if (
      segregatedWriteKeys &&
      split.transient &&
      typeof split.transient === "object"
    ) {
      for (const collection in segregatedWriteKeys) {
        segregatedWrites[collection] = segregatedWrites[collection] || {};
        segregatedWrites[collection][id as any] = mapToRecord(
          ctx.getOrUndefined("forceSegregateWrite")
            ? split.model
            : (split.transient as any) || {},
          segregatedWriteKeys[collection]
        );
      }
    }

    // In mirror mode, the record should contain ALL model properties (full copy)
    const record = isMirror ? mapToRecord(model) : mapToRecord(split.model);

    return {
      record,
      id: (model as any)[pk] as string,
      transient:
        !isMirror && split.transient && Object.keys(split.transient).length
          ? mapToRecord(split.transient)
          : undefined,
      segregated: isMirror ? undefined : segregatedWrites,
    };
  }

  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    transient?: Record<string, any>,
    ...args: ContextualArgs<FabricContractContext>
  ): M {
    const { log, ctx } = this.logCtx(args, this.revert);
    const ob: Record<string, any> = {};
    const pk = Model.pk(clazz);
    const pkProps = Model.pkProps(clazz);
    if (pkProps?.type === Number && typeof id === "string") {
      id = Number(id);
    }
    ob[pk as string] = id;
    log.silly(`Rebuilding model ${clazz.name} id ${id}`);

    function mapToModel(r: Record<any, any>) {
      const m = (
        typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
      ) as M;
      const attributes = Model.getAttributes(clazz);
      const keys = attributes.length ? attributes : Object.keys(m);
      return keys
        .filter((k) => k !== (pk as string))
        .reduce((accum: M, key) => {
          (accum as Record<string, any>)[key] =
            r[Model.columnName(accum, key as any)];
          return accum;
        }, m);
    }

    let result = mapToModel(obj);

    if (transient && !this.shouldRebuildWithTransient(ctx)) {
      log.debug(
        `filtering transient properties: ${Object.keys(transient).join(", ")}`
      );
      result = Object.entries(result).reduce((acc, [key, v]) => {
        if (key === pk || !(key in transient)) {
          acc[key as keyof M] = v;
        }
        return acc;
      }, new clazz());
    }

    return result;
  }

  private shouldRebuildWithTransient(ctx: FabricContractContext): boolean {
    if (!ctx) return false;
    if (ctx.getOrUndefined("rebuildWithTransient")) return true;
    const operation = ctx.getOrUndefined("operation") as string | undefined;
    if (!operation) return true;
    const op = operation.toString().toLowerCase();
    return !TransactionOperationKeys.map((k) => k.toLowerCase()).includes(op);
  }

  private getContextMsp(context: FabricContractContext): string | undefined {
    const identity = context.get("identity") as
      | string
      | ClientIdentity
      | undefined;
    if (!identity) return undefined;
    if (typeof identity === "string") return identity;
    try {
      return identity.getMSPID();
    } catch {
      return undefined;
    }
  }

  private shouldAllowMirroring(ctx: FabricContractContext): boolean {
    return !!ctx.get("allowMirroring");
  }

  private enforceMirrorAuthorization<M extends Model>(
    clazz: Constructor<M>,
    ctx: FabricContractContext
  ): void {
    if (!this.shouldAllowMirroring(ctx)) return;
    const mirrorMeta = Model.mirroredAt(clazz);
    if (!mirrorMeta) return;
    const msp = this.getContextMsp(ctx);
    if (!msp) return;
    if (
      msp === mirrorMeta.mspId ||
      (mirrorMeta.condition && mirrorMeta.condition(msp))
    ) {
      throw new AuthorizationError(
        `Organization ${msp} is not authorized to modify mirrored data`
      );
    }
  }

  override createPrefix<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: MaybeContextualArg<FabricContractContext>
  ) {
    const { ctxArgs } = this.logCtx(args, this.createPrefix);
    const record: Record<string, any> = {};
    record[CouchDBKeys.TABLE] = Model.tableName(tableName);
    Object.assign(record, model);

    return [tableName, id, record, ...ctxArgs] as [
      Constructor<M>,
      PrimaryKeyType,
      Record<string, any>,
      ...any[],
      FabricContractContext,
    ];
  }

  override updatePrefix<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: MaybeContextualArg<FabricContractContext>
  ): any[] {
    const { ctxArgs } = this.logCtx(args, this.updatePrefix);
    const record: Record<string, any> = {};
    record[CouchDBKeys.TABLE] = Model.tableName(tableName);
    Object.assign(record, model);

    return [tableName, id, record, ...ctxArgs] as [
      Constructor<M>,
      PrimaryKeyType,
      Record<string, any>,
      ...any[],
      FabricContractContext,
    ];
  }

  protected override createAllPrefix<M extends Model>(
    tableName: Constructor<M>,
    ids: PrimaryKeyType[],
    models: Record<string, any>[],
    ...args: [...any, FabricContractContext]
  ): (string | string[] | number[] | Record<string, any>[])[] {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");

    const ctx: FabricContractContext = args.pop();

    const records = ids.map((id, count) => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = Model.tableName(tableName);
      Object.assign(record, models[count]);
      return record;
    });
    return [tableName, ids, records, ctx as any];
  }

  protected override updateAllPrefix<M extends Model>(
    tableName: Constructor<M>,
    ids: PrimaryKeyType[],
    models: Record<string, any>[],
    ...args: [...any, FabricContractContext]
  ) {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");

    const ctx: FabricContractContext = args.pop();

    const records = ids.map((id, count) => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = Model.tableName(tableName);
      Object.assign(record, models[count]);
      return record;
    });
    return [tableName, ids, records, ctx as any];
  }

  override parseError<E extends BaseError>(
    err: Error | string,
    reason?: string
  ): E {
    return FabricContractAdapter.parseError(reason || err);
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<FabricContractContext>>
  ): Promise<
    FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false,
    overrides?: Partial<FlagsOf<FabricContractContext>> | Ctx
  ):
    | Promise<
        FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
      >
    | FabricContextualizedArgs<ARGS, METHOD extends string ? true : false> {
    const ctx = args[args.length - 1];
    let mergedOverrides = overrides as
      | Partial<FlagsOf<FabricContractContext>>
      | Ctx
      | undefined;

    if (
      ctx instanceof FabricContractContext &&
      ctx.getOrUndefined("allowContextTransientMap") &&
      ctx.getOrUndefined("stub")
    ) {
      const transientOverrides = this.readTransientOverrides(ctx);
      if (transientOverrides) {
        mergedOverrides = Object.assign(
          {},
          overrides || {},
          transientOverrides
        );
      }
    }

    if (!allowCreate)
      return super.logCtx<ARGS, METHOD>(
        args,
        operation as any,
        allowCreate as any,
        mergedOverrides as any
      ) as any;

    return super.logCtx
      .call(this, args, operation as any, allowCreate, mergedOverrides as any)
      .then((res) => {
        if (!(res.ctx instanceof FabricContractContext))
          throw new InternalError(`Invalid context binding`);
        return Object.assign(res, {
          ...(res.ctx.getOrUndefined("stub")
            ? { stub: res.ctx.getOrUndefined("stub") }
            : {}),
          ...(res.ctx.getOrUndefined("identity")
            ? { identity: res.ctx.getOrUndefined("identity") }
            : {}),
        });
      }) as any;
  }

  private readTransientOverrides(
    ctx: FabricContractContext
  ): Partial<FlagsOf<FabricContractContext>> | undefined {
    if (!ctx.getOrUndefined("allowContextTransientMap")) return;
    const stub = ctx.getOrUndefined("stub") as ChaincodeStub | undefined;
    if (!stub) return undefined;
    const transientMap = stub.getTransient();
    if (!transientMap.has(FabricModelKeys.OVERRIDES)) return undefined;
    const raw = transientMap.get(FabricModelKeys.OVERRIDES);
    if (!raw) return undefined;
    return JSON.parse(Buffer.from(raw).toString("utf8"));
  }

  override async updateObservers(
    table: Constructor<any> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<void> {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    const { ctx, ctxArgs } = this.logCtx(args, this.updateObservers);
    if (ctx.isFullySegregated) return;
    if (ctx.getOrUndefined("noEmit")) return;
    if (!ctx.stub) return;
    const isBulk = Array.isArray(id);
    const emitSingle = !ctx.getOrUndefined("noEmitSingle");
    const emitBulk = !ctx.getOrUndefined("noEmitBulk");
    if ((isBulk && emitBulk) || (!isBulk && emitSingle)) {
      // Pass the MSP owner from stub and the result payload (if any) in the
      // positions the handler expects: (table, event, id, owner?, payload?, ctx)
      const mspId = ctx.stub.getMspID ? ctx.stub.getMspID() : undefined;
      const nonCtxArgs = ctxArgs.slice(0, -1); // everything before ctx
      const payload = nonCtxArgs.length > 0 ? nonCtxArgs[0] : undefined;
      await this.observerHandler.updateObservers(
        table,
        event,
        id,
        mspId,
        payload,
        ctx
      );
    }
  }

  static override parseError<E extends BaseError>(err: Error | string): E {
    // if (
    //   MISSING_PRIVATE_DATA_REGEX.test(
    //     typeof err === "string" ? err : err.message
    //   )
    // )
    //   return new UnauthorizedPrivateDataAccess(err) as E;
    const msg = typeof err === "string" ? err : err.message;
    if (msg.includes(NotFoundError.name)) return new NotFoundError(err) as E;
    if (msg.includes(ConflictError.name)) return new ConflictError(err) as E;
    if (msg.includes(BadRequestError.name))
      return new BadRequestError(err) as E;
    if (msg.includes(QueryError.name)) return new QueryError(err) as E;
    if (msg.includes(PagingError.name)) return new PagingError(err) as E;
    if (msg.includes(UnsupportedError.name))
      return new UnsupportedError(err) as E;
    if (msg.includes(MigrationError.name)) return new MigrationError(err) as E;
    if (msg.includes(ObserverError.name)) return new ObserverError(err) as E;
    if (msg.includes(AuthorizationError.name))
      return new AuthorizationError(err) as E;
    if (msg.includes(ForbiddenError.name)) return new ForbiddenError(err) as E;
    if (msg.includes(ConnectionError.name))
      return new ConnectionError(err) as E;
    if (msg.includes(SerializationError.name))
      return new SerializationError(err) as E;
    if (msg.includes("no ledger context"))
      return new MissingContextError(
        `No context found. this can be caused by debugging: ${msg}`
      ) as E;

    return new InternalError(err) as E;
  }

  /**
   * @description Static method for decoration overrides
   * @summary Overrides/extends decaf decoration with Fabric-specific functionality
   * @static
   * @override
   * @return {void}
   */
  static override decoration(): void {
    super.decoration();
    Decoration.flavouredAs(FabricFlavour)
      .for(PersistenceKeys.CREATED_BY)
      .define({
        decorator: function createdBy() {
          return apply(
            onCreate(createdByOnFabricCreateUpdate),
            propMetadata(PersistenceKeys.CREATED_BY, {})
          );
        },
      } as any)
      .apply();

    Decoration.flavouredAs(FabricFlavour)
      .for(PersistenceKeys.UPDATED_BY)
      .define({
        decorator: function createdBy() {
          return apply(
            onCreateUpdate(createdByOnFabricCreateUpdate),
            propMetadata(PersistenceKeys.UPDATED_BY, {})
          );
        },
      } as any)
      .apply();

    Decoration.flavouredAs(FabricFlavour)
      .for(PersistenceKeys.COLUMN)
      .extend(FabricProperty())
      .apply();

    Decoration.flavouredAs(FabricFlavour)
      .for(ValidationKeys.DATE)
      .extend(function fabricProperty() {
        return (target: any, prop?: any) => {
          Property(prop, "string:date")(target, prop);
        };
      });

    Decoration.flavouredAs(FabricFlavour)
      .for(PersistenceKeys.TABLE)
      .extend(function table(obj: any) {
        const chain: any[] = [];
        let current =
          typeof obj === "function"
            ? Metadata.constr(obj)
            : Metadata.constr(obj.constructor);

        while (current && current !== Object && current.prototype) {
          chain.push(current);
          current = Object.getPrototypeOf(current);
        }

        console.log(chain.map((c) => c.name || c));

        // Apply from the base class down to the decorated class
        while (chain.length > 0) {
          const constructor = chain.pop();
          console.log(`Calling on ${constructor.name}`);
          FabricObject()(constructor);
        }

        return FabricObject()(obj);
      })
      .apply();
  }
}

FabricContractAdapter.decoration();
Adapter.setCurrent(FabricFlavour);
