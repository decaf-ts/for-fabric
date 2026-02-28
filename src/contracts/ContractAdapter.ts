import {
  CouchDBAdapter,
  CouchDBKeys,
  MangoQuery,
  ViewResponse,
} from "@decaf-ts/for-couchdb";
import { Model, ValidationKeys } from "@decaf-ts/decorator-validation";
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
  Sequence,
  SequenceOptions,
  UnsupportedError,
  Adapter,
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
  Context,
  RawResult,
  Paginator,
  ContextualArgs,
  MaybeContextualArg,
  MethodOrOperation,
  AllOperationKeys,
  FlagsOf,
  ContextOf,
  TransactionOperationKeys,
  EventIds,
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
import { FabricFlavour } from "../shared/constants";
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

export type FabricContextualizedArgs<
  ARGS extends any[] = any[],
  EXTEND extends boolean = false,
> = ContextualizedArgs<FabricContractContext, ARGS, EXTEND> & {
  stub: ChaincodeStub;
  identity: ClientIdentity;
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
    const mirrorCollection = ctx.getOrUndefined("mirrorCollection") as
      | string
      | undefined;
    const fullySegregated = ctx.isFullySegregated && !mirrorCollection;

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
    const mirrorCollection = ctx.getOrUndefined("mirrorCollection") as
      | string
      | undefined;
    const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;
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
    for (const col of readCollections)
      Object.assign(
        model,
        await this.forPrivate(col).readState(composedKey, ctx)
      );
    return model;
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
    const mirrorCollection = ctx.getOrUndefined("mirrorCollection") as
      | string
      | undefined;

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
    const { ctx } = this.logCtx(args, this.delete);

    this.enforceMirrorAuthorization(clazz, ctx);
    const tableName = Model.tableName(clazz);

    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const mirrorCollection = ctx.getOrUndefined("mirrorCollection") as
      | string
      | undefined;
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
        if (!ctx.isFullySegregated) await this.deleteState(composedKey, ctx);
      } catch (e: unknown) {
        throw this.parseError(e as Error);
      }

      const collections = ctx.getReadCollections();
      if (collections && collections.length) {
        for (const col of collections) {
          Object.assign(
            model,
            await this.forPrivate(col).readState(composedKey, ctx)
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
                await ctx.stub.deletePrivateData(collection, id.toString());
                return;
              }
              case "readState": {
                // readState signature: (id: string, ctx: FabricContractContext)
                const [id, ctx] = argsList;
                const data = await ctx.stub.getPrivateData(collection, id);
                if (!data) return "";
                try {
                  return FabricContractAdapter.serializer.deserialize(
                    data.toString("utf8")
                  );
                } catch {
                  return data.toString("utf8");
                }
              }
              case "queryResult": {
                const [stub, rawInput] = argsList;
                const res = await stub.getPrivateDataQueryResult(
                  collection,
                  JSON.stringify(rawInput)
                );
                return res.iterator || res;
              }
              case "queryResultPaginated": {
                const [stub, rawInput, limit, , bookmark] = argsList;

                // Fabric has no native pagination API for private data.
                // Emulate it: query all matching records (with selector
                // and sort preserved), locate the bookmark position in
                // the sorted results, then slice to the page size.
                const query = { ...rawInput };
                delete query.limit;
                delete query.skip;
                delete query.bookmark;

                let iterator = await (
                  stub as ChaincodeStub
                ).getPrivateDataQueryResult(collection, JSON.stringify(query));
                iterator = (iterator as any).iterator || iterator;

                // Collect all matching records from the iterator
                const allResults: Array<{ key: string; value: Buffer }> = [];
                while (true) {
                  const res = await iterator.next();
                  if (res.value && res.value.value) {
                    allResults.push({
                      key: res.value.key,
                      value: Buffer.isBuffer(res.value.value)
                        ? res.value.value
                        : Buffer.from(
                            (res.value.value as any).toString("utf8")
                          ),
                    });
                  }
                  if (res.done) {
                    await iterator.close();
                    break;
                  }
                }

                // Find the bookmark position and slice the page
                let startIndex = 0;
                if (bookmark) {
                  const found = allResults.findIndex((r) => r.key === bookmark);
                  startIndex = found >= 0 ? found + 1 : 0;
                }
                const paged = allResults.slice(startIndex, startIndex + limit);
                const lastKey =
                  paged.length > 0
                    ? paged[paged.length - 1].key
                    : bookmark || "";

                // Wrap the page in an async iterator for resultIterator()
                let idx = 0;
                const arrayIterator = {
                  async next() {
                    if (idx < paged.length) {
                      return { value: paged[idx++], done: false };
                    }
                    return { value: undefined as any, done: true };
                  },
                  async close() {},
                };

                return {
                  iterator:
                    arrayIterator as unknown as Iterators.StateQueryIterator,
                  metadata: {
                    fetchedRecordsCount: paged.length,
                    bookmark: paged.length >= limit ? lastKey : "",
                  },
                };
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
    return stub.getQueryResult(JSON.stringify(rawInput));
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
    return stub.getQueryResultWithPagination(
      JSON.stringify(rawInput),
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
    };

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

    const { skip, limit } = rawInput;
    const bookmark = rawInput["bookmark"];
    let resp = { docs: [], bookmark: undefined as string | undefined };

    // Query public state only when the model is NOT fully segregated
    if (!fullySegregated) {
      let iterator: Iterators.StateQueryIterator;
      if (limit || skip) {
        delete rawInput["limit"];
        delete rawInput["skip"];
        log.debug(
          `Retrieving paginated iterator: limit: ${limit}/ skip: ${skip}`
        );
        const response: StateQueryResponse<Iterators.StateQueryIterator> =
          (await this.queryResultPaginated(
            ctx.stub,
            rawInput,
            limit || Number.MAX_VALUE,
            (skip as any)?.toString(),
            bookmark,
            ...[ctx as FabricContractContext]
          )) as StateQueryResponse<Iterators.StateQueryIterator>;
        resp.bookmark = response.metadata.bookmark;
        iterator = response.iterator;
      } else {
        log.debug("Retrieving iterator");
        iterator = (await this.queryResult(
          ctx.stub,
          rawInput,
          ctx
        )) as Iterators.StateQueryIterator;
      }
      log.debug("Iterator acquired");

      resp.docs = (await this.resultIterator(log, iterator)) as any;
      log.debug(
        `returning ${Array.isArray(resp.docs) ? resp.docs.length : 1} results`
      );
    } else {
      // For fully segregated models, strip pagination fields from rawInput
      // so the segregated query below can re-apply them cleanly
      if (limit || skip) {
        delete rawInput["limit"];
        delete rawInput["skip"];
      }
      log.debug("Skipping public state query (fully segregated model)");
    }

    const collections = enableSegregates ? ctx.getReadCollections() : undefined;

    if (collections && collections.length) {
      // Build a fresh input with limit/skip/bookmark restored
      const segregatedInput = { ...rawInput };
      if (limit) segregatedInput.limit = limit;
      if (skip) segregatedInput.skip = skip;
      if (bookmark) segregatedInput["bookmark"] = bookmark;

      const segregated: any[] = [];
      for (const collection of collections) {
        segregated.push(
          await this.forPrivate(collection).raw(
            { ...segregatedInput },
            false,
            true,
            ...ctxArgs
          )
        );
      }
      // choose the response with the most results
      resp = segregated.reduce((acc, curr) => {
        if (!acc) return curr;
        if (curr.docs && curr.docs.length >= acc?.docs.length) return curr;
        return acc;
      }, resp);
    }

    if (docsOnly) {
      return resp.docs as any;
    }
    return resp as any;
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

  override Statement<M extends Model>(): FabricStatement<M, any> {
    return new FabricStatement(this as any);
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

    const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;

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
    if (segregatedWriteKeys) {
      for (const collection in segregatedWriteKeys) {
        segregatedWrites[collection] = segregatedWrites[collection] || {};
        segregatedWrites[collection][id as any] = mapToRecord(
          ctx.getOrUndefined("forceSegregateWrite")
            ? split.model
            : (split.transient as any),
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

  private enforceMirrorAuthorization<M extends Model>(
    clazz: Constructor<M>,
    ctx: FabricContractContext
  ): void {
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
    if (!allowCreate)
      return super.logCtx<ARGS, METHOD>(
        args,
        operation as any,
        allowCreate as any,
        overrides as any
      ) as any;

    return super.logCtx
      .call(this, args, operation as any, allowCreate, overrides as any)
      .then((res) => {
        if (!(res.ctx instanceof FabricContractContext))
          throw new InternalError(`Invalid context binding`);
        return Object.assign(res, {
          stub: res.ctx.stub,
          identity: res.ctx.identity,
        });
      }) as any;
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
    const { log, ctx, ctxArgs } = this.logCtx(args, this.updateObservers);
    if (ctx.isFullySegregated) return;
    if (ctx.getOrUndefined("noEmit")) return;
    if (!ctx.stub) return;
    const isBulk = Array.isArray(id);
    const emitSingle = !ctx.getOrUndefined("noEmitSingle");
    const emitBulk = !ctx.getOrUndefined("noEmitBulk");
    if ((isBulk && emitBulk) || (!isBulk && emitSingle)) {
      await this.observerHandler.updateObservers(table, event, id, ...ctxArgs);
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
