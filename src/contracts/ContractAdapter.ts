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
  ConflictError,
  InternalError,
  NotFoundError,
  onCreate,
  onCreateUpdate,
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

const MIRROR_SKIP_FLAG_PREFIX = "mirror:skip:";

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
    const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;
    if (!isMirror) {
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
              data[collection],
              ctx
            )
          );
        }
      }
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  private normalizeForPublic<M extends Model>(
    clazz: Constructor<M>,
    model: Record<string, any>,
    ctx: FabricContractContext
  ): Record<string, any> {
    if (
      model &&
      typeof model === "object" &&
      Object.prototype.hasOwnProperty.call(model, CouchDBKeys.TABLE)
    ) {
      return model;
    }
    const instance = Model.isModel(model)
      ? (model as unknown as M)
      : (Model.build(model, clazz.name) as M);
    const prepared = this.prepare(instance, ctx);
    return prepared.record;
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
    let model: Record<string, any>;
    // const fabricCtx = ctx as FabricContractContext;
    try {
      model = ctx.isFullySegregated
        ? {}
        : await this.readState(composedKey, ctx);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    const collections = ctx.getReadCollections();
    if (collections && collections.length) {
      for (const col of collections)
        Object.assign(
          model,
          await this.forPrivate(col).readState(composedKey, ctx)
        );
    }
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
    log.info(`in ADAPTER create with args ${args}`);
    const tableName = Model.tableName(clazz);
    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;

    try {
      log.info(`adding entry to ${tableName} table with pk ${id}`);

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
              data[collection],
              ctx
            )
          );
        }
      }
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;

    //
    // this.enforceMirrorAuthorization(clazz, ctx);
    // const tableName = Model.tableName(clazz);
    // const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    //
    // try {
    //   log.verbose(`updating entry to ${tableName} table with pk ${id}`);
    //   const sanitizedModel = this.normalizeForPublic(clazz, model, ctx);
    //   if (ctx.isFullySegregated) {
    //     await this.flushSegregatedWrites(ctx, composedKey);
    //     return sanitizedModel;
    //   }
    //   model = await this.putState(composedKey, sanitizedModel, ctx);
    // } catch (e: unknown) {
    //   throw this.parseError(e as Error);
    // }
    //
    // return model;
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
    const { ctx, log, ctxArgs } = this.logCtx(args, this.delete);

    this.enforceMirrorAuthorization(clazz, ctx);
    const tableName = Model.tableName(clazz);

    const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    let model: Record<string, any>;
    // const fabricCtx = ctx as FabricContractContext;
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

    // const pkProp = Model.pk(clazz);
    // const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;
    // let model: Record<string, any>;
    // let shouldDeletePublicState = false;
    // try {
    //   const composedKey = ctx.stub.createCompositeKey(tableName, [String(id)]);
    //   if (!isMirror) {
    //     model = await this.read(clazz, id, ...ctxArgs);
    //     shouldDeletePublicState = this.hasPublicState(model, clazz);
    //   } else {
    //     model = { [pkProp as string]: id } as Record<string, any>;
    //   }
    //   log.verbose(`deleting entry with pk ${id} from ${tableName} table`);
    //   if (shouldDeletePublicState) {
    //     await this.deleteState(composedKey, ctx);
    //   }
    //   await this.deleteSegregatedCollections(ctx, composedKey);
    // } catch (e: unknown) {
    //   throw this.parseError(e as Error);
    // }

    return model;
  }

  protected async deleteState(id: string, context: FabricContractContext) {
    const { ctx } = this.logCtx([context], this.deleteState);
    const collection = ctx.getOrUndefined("segregated") as string | undefined;
    if (collection) await ctx.stub.deletePrivateData(collection, id);
    else await ctx.stub.deleteState(id);
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
                return stub.getPrivateDataQueryResult(collection, rawInput);
              }
              case "queryResultPaginated": {
                const [stub, rawInput, limit, skip] = argsList;
                const iterator = await (
                  stub as ChaincodeStub
                ).getPrivateDataQueryResult(collection, rawInput);
                const results: any[] = [];
                let count = 0;
                let reachedBookmark = skip ? false : true;
                let lastKey: string | null = null;

                while (true) {
                  const res = await iterator.next();

                  if (res.value && res.value.value.toString()) {
                    const recordKey = res.value.key;
                    const recordValue = (res.value.value as any).toString(
                      "utf8"
                    );

                    // If we have a skip, skip until we reach it
                    if (!reachedBookmark) {
                      if (recordKey === skip?.toString()) {
                        reachedBookmark = true;
                      }
                      continue;
                    }

                    results.push({
                      Key: recordKey,
                      Record: JSON.parse(recordValue),
                    });
                    lastKey = recordKey;
                    count++;

                    if (count >= limit) {
                      await iterator.close();
                      return {
                        iterator:
                          results as unknown as Iterators.StateQueryIterator,
                        metadata: {
                          fetchedRecordsCount: results.length,
                          bookmark: lastKey,
                        },
                      };
                    }
                  }

                  if (res.done) {
                    await iterator.close();
                    return {
                      iterator:
                        results as unknown as Iterators.StateQueryIterator,
                      metadata: {
                        fetchedRecordsCount: results.length,
                        bookmark: "",
                      },
                    };
                  }
                }
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

    // const { log } = this.logCtx([ctx], this.putState);
    try {
      data = Buffer.from(
        FabricContractAdapter.serializer.serialize(model as Model, false)
      );
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id}: ${e}`
      );
    }
    //
    // const collection = ctx.getOrUndefined("segregated") as string | undefined;
    // if (collection) {
    //   if (ctx.getOrUndefined("mirror")) {
    //     const cacheKey = `segregatedRecord:${collection}:${id.toString()}`;
    //     let existingRecord = ctx.cache.get(cacheKey) as
    //       | Record<string, any>
    //       | undefined;
    //     ctx.cache.remove(cacheKey);
    //     if (!existingRecord) {
    //       const existing = await ctx.stub.getPrivateData(
    //         collection,
    //         id.toString()
    //       );
    //       if (existing) {
    //         try {
    //           existingRecord = FabricContractAdapter.serializer.deserialize(
    //             existing.toString()
    //           );
    //         } catch {
    //           existingRecord = undefined;
    //         }
    //       }
    //     }
    //     if (existingRecord) {
    //       const merged = Object.assign({}, existingRecord, model);
    //       data = Buffer.from(
    //         FabricContractAdapter.serializer.serialize(merged as Model, false)
    //       );
    //     }
    //   }
    //   await ctx.stub.putPrivateData(collection, id.toString(), data);
    // } else {
    await ctx.stub.putState(id.toString(), data);
    //   await this.flushSegregatedWrites(ctx, id);
    // }

    // log.silly(
    //   `state stored${collection ? ` in ${collection} collection` : ""} under id ${id}`
    // );
    return model;
  }

  private async flushSegregatedWrites(
    ctx: FabricContractContext,
    compositeKey: string
  ): Promise<void> {
    const writeCollections = ctx.getWriteCollections();
    if (!writeCollections.length) return;

    const writes = (ctx as any)._segregateWrite as
      | Record<string, string[]>
      | undefined;
    if (!writes) return;
    for (const collection of writeCollections) {
      const entries = writes[collection];
      if (!entries || !entries.length) continue;
      const record = this.buildSegregatedRecord(entries, collection);
      if (!record || !Object.keys(record).length) continue;

      const cacheKey = `segregatedRecord:${collection}:${compositeKey}`;
      ctx.cache.put(cacheKey, record);

      const privateCtx = ctx.override({
        segregated: collection,
      });
      await this.putState(compositeKey, record, privateCtx);
    }
    ctx.cache.remove("segregateWrite");
  }

  private buildSegregatedRecord(
    entries: string[],
    collection: string
  ): Record<string, any> | undefined {
    if (!entries || !entries.length) return undefined;
    const firstModel = entries.find((entry) => !!entry);
    if (!firstModel) return undefined;
    const clazz = firstModel.constructor as Constructor<any>;
    const pkProp = Model.pk(clazz) as string;
    const keys = new Set<string>();
    entries.forEach((entry) => keys.add(entry as string));
    const metadataFields = this.getFieldsForCollection(
      firstModel as any,
      collection
    );
    metadataFields.forEach((key) => keys.add(key));
    if (pkProp) keys.add(pkProp);

    const record: Record<string, any> = {};
    // keys.forEach((key) => {
    //   const value = entries
    //     .map((entry) => entry.model[key as keyof typeof entry.model])
    //     .find((val) => typeof val !== "undefined");
    //   if (typeof value === "undefined") return;
    //   const mappedProp = Model.columnName(clazz, key as any);
    //   if (this.isReserved(mappedProp))
    //     throw new InternalError(`Property name ${mappedProp} is reserved`);
    //   record[mappedProp] =
    //     value instanceof Date ? new Date(value as Date) : value;
    // });

    return record;
  }

  private async mergeSegregatedReads(
    ctx: FabricContractContext,
    id: string,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    // Use getReadCollections which reads from the private _segregateRead property
    const reads = ctx.getReadCollections();
    if (!reads?.length) return model;
    for (const collection of reads) {
      const skipFlagKey = `${MIRROR_SKIP_FLAG_PREFIX}${collection}`;
      if (ctx.getOrUndefined(skipFlagKey as any)) continue;
      const privateRecord = await this.readPrivateRecord(ctx, collection, id);
      if (!privateRecord) continue;
      Object.entries(privateRecord).forEach(([key, value]) => {
        if (typeof value === "undefined") return;
        model[key] = value;
      });
    }
    return model;
  }

  private async readPrivateRecord(
    ctx: FabricContractContext,
    collection: string,
    id: string
  ): Promise<Record<string, any> | undefined> {
    const data = await ctx.stub.getPrivateData(collection, id);
    if (!data) return undefined;
    const text = data.toString();
    if (!text) return undefined;
    try {
      return FabricContractAdapter.serializer.deserialize(text);
    } catch {
      return undefined;
    }
  }

  private async deleteSegregatedCollections(
    ctx: FabricContractContext,
    id: string
  ): Promise<void> {
    // Use getReadCollections which reads from the private _segregateRead property
    const reads = ctx.getReadCollections();
    if (!reads?.length) return;
    for (const collection of reads) {
      try {
        await ctx.stub.deletePrivateData(collection, id);
      } catch {
        // ignore missing private data
      }
    }
  }

  protected async readState(id: string, ctx: FabricContractContext) {
    let result: any;

    const { log } = this.logCtx([ctx], this.readState);
    const res: string = (await ctx.stub.getState(id.toString())).toString();
    // const collection = ctx.get("segregated");
    // if (collection)
    //   res = (
    //     await ctx.stub.getPrivateData(collection, id.toString())
    //   ).toString();
    // else res = (await ctx.stub.getState(id.toString())).toString();

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
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<Iterators.StateQueryIterator> {
    const { ctx } = this.logCtx(args, this.queryResult);
    let res: Iterators.StateQueryIterator;
    const collection = ctx.get("segregated");
    if (collection)
      res = await ctx.stub.getPrivateDataQueryResult(
        collection,
        JSON.stringify(rawInput)
      );
    else res = await stub.getQueryResult(JSON.stringify(rawInput));

    return res;
  }

  private createRowsIterator(
    rows: Array<{ key: string; value: Buffer }>
  ): Iterators.StateQueryIterator {
    let index = 0;
    return {
      // @ts-expect-error typeing of iterator?
      async next() {
        if (index < rows.length) {
          const row = rows[index++];
          return {
            value: { key: row.key, value: row.value },
            done: false,
          };
        }
        return { done: true };
      },
      async close() {
        // noop
      },
    };
  }

  protected async queryResultPaginated(
    stub: ChaincodeStub,
    rawInput: any,
    limit: number = 250,
    page?: number,
    bookmark?: string | number,
    ...args: any[]
  ): Promise<StateQueryResponse<Iterators.StateQueryIterator>> {
    const { ctx } = this.logCtx(args, this.readState);
    let res: StateQueryResponse<Iterators.StateQueryIterator>;
    const collection = ctx.get("segregated");
    if (collection) {
      const clonedInput = JSON.parse(JSON.stringify(rawInput));
      clonedInput.selector = clonedInput.selector || {};
      if (bookmark) clonedInput.selector._id = { $gt: bookmark.toString() };
      const limitValue =
        typeof limit === "number" && limit > 0 ? limit : Number.MAX_VALUE;
      const iterator = await stub.getPrivateDataQueryResult(
        collection,
        JSON.stringify(clonedInput)
      );
      const rows: Array<{ key: string; value: Buffer }> = [];
      let lastKey = "";
      while (rows.length < limitValue) {
        const resRow = await iterator.next();
        if (resRow.done) break;
        if (resRow.value && resRow.value.value) {
          rows.push({
            key: resRow.value.key,
            value: resRow.value.value as Buffer,
          });
          lastKey = resRow.value.key;
        }
      }
      await iterator.close();
      res = {
        iterator: this.createRowsIterator(rows),
        metadata: {
          fetchedRecordsCount: rows.length,
          bookmark: rows.length ? lastKey : "",
        },
      };
    } else
      res = await stub.getQueryResultWithPagination(
        JSON.stringify(rawInput),
        limit,
        bookmark?.toString()
      );

    return res;
  }

  protected mergeModels(results: Record<string, any>[]): Record<string, any> {
    const extract = (model: Record<string, any>) =>
      Object.entries(model).reduce((accum: Record<string, any>, [key, val]) => {
        if (typeof val !== "undefined") accum[key] = val;
        return accum;
      }, {});

    let finalModel: Record<string, any> = results.pop() as Record<string, any>;

    for (const res of results) {
      finalModel = Object.assign({}, extract(finalModel), extract(res));
    }

    return finalModel;
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
    let baseFlags = Object.assign(
      {
        segregated: false,
        rebuildWithTransient: false,
        fullySegregated: false,
      },
      flags
    );
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
    const { log, ctx } = this.logCtx(args, this.raw);

    const { skip, limit } = rawInput;
    let iterator: Iterators.StateQueryIterator;
    const resp = { docs: [], bookmark: undefined as string | undefined };
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
          rawInput["bookmark"],
          ctx
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
    if (docsOnly) return resp.docs as any;
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

    //
    // const collection = ctx.getOrUndefined("segregated") as string | undefined;
    // const isMirror = ctx.getOrUndefined("mirror") as boolean | undefined;
    //
    // let entries: [string, any][];
    //
    // if (collection && isMirror) {
    //   // MIRROR mode: keep ALL properties (full model copy)
    //   entries = Object.keys(model)
    //     .map((key) => [key, (model as any)[key]] as [string, any])
    //     .filter(([, val]) => typeof val !== "undefined");
    // } else if (collection) {
    //   // SEGREGATED mode: keep only properties decorated for this collection + pk
    //   const collectionFields = this.getFieldsForCollection(model, collection);
    //   entries = [...new Set([pk as string, ...collectionFields])]
    //     .map((key) => [key, (model as any)[key]] as [string, any])
    //     .filter(([, val]) => typeof val !== "undefined");
    // } else {
    //   // NORMAL mode: strip transient (current behavior)
    //   const split = Model.segregate(model);
    //   entries = Object.entries(split.model).filter(
    //     ([, val]) => typeof val !== "undefined"
    //   );
    // }

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
        segregatedWrites[collection] = mapToRecord(
          ctx.getOrUndefined("forceSegregateWrite")
            ? split.model
            : (split.transient as any),
          segregatedWriteKeys[collection]
        );
      }
    }

    return {
      record: mapToRecord(split.model),
      id: (model as any)[pk] as string,
      transient:
        split.transient && Object.keys(split.transient).length
          ? mapToRecord(split.transient)
          : undefined,
      segregated: segregatedWrites,
    };
  }

  /**
   * @description Gets the property names that belong to a specific private/shared collection
   * @summary Looks up per-property metadata set by @privateData/@sharedData decorators
   * to determine which properties are decorated for the given collection name.
   */
  private getFieldsForCollection<M extends Model>(
    model: M,
    collection: string
  ): string[] {
    const constr = model.constructor as Constructor<M>;
    const properties = Metadata.validatableProperties(constr);
    if (!properties) return [];
    return properties.filter((prop: string) => {
      const privateKey = Metadata.key(FabricModelKeys.PRIVATE, prop);
      const privateMeta = Metadata.get(constr, privateKey);
      if (privateMeta?.collections?.includes(collection)) return true;
      const sharedKey = Metadata.key(FabricModelKeys.SHARED, prop);
      const sharedMeta = Metadata.get(constr, sharedKey);
      if (sharedMeta?.collections?.includes(collection)) return true;
      return false;
    });
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
    ob[pk as string] = id;
    log.silly(`Rebuilding model ${clazz.name} id ${id}`);

    function mapToModel(r: Record<any, any>) {
      const m = (
        typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
      ) as M;
      return Object.keys(r).reduce((accum: M, key) => {
        (accum as Record<string, any>)[key] =
          obj[Model.columnName(accum, key as any)];
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

  private hasPublicState(
    model: Record<string, any>,
    clazz: Constructor<any>
  ): boolean {
    if (!model) return false;
    const instance = Model.isModel(model)
      ? (model as Model)
      : (Model.build(model, clazz.name) as Model);
    const split = Model.segregate(instance);
    const pkProp = Model.pk(clazz) as string;
    return Object.keys(split.model).some(
      (key) =>
        key !== pkProp &&
        typeof (split.model as Record<string, any>)[key] !== "undefined"
    );
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
        if (!res.ctx.stub) throw new InternalError(`Missing Stub`);
        if (!res.ctx.identity) throw new InternalError(`Missing Identity`);
        return Object.assign(res, {
          stub: res.ctx.stub,
          identity: res.ctx.identity,
        });
      }) as any;
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
