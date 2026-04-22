import {
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import {
  Adapter,
  Context,
  MaybeContextualArg,
  Sequence,
  SequenceModel,
  SequenceOptions,
  Serial,
  UnsupportedError,
} from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import type { FabricContractAdapter } from "./ContractAdapter";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

/**
 * @description Abstract base class for sequence generation
 * @summary Provides a framework for generating sequential values (like primary keys) in the persistence layer.
 * Implementations of this class handle the specifics of how sequences are stored and incremented in different
 * database systems.
 * @param {SequenceOptions} options - Configuration options for the sequence generator
 * @class Sequence
 * @example
 * ```typescript
 * // Example implementation for a specific database
 * class PostgresSequence extends Sequence {
 *   constructor(options: SequenceOptions) {
 *     super(options);
 *   }
 *
 *   async next(): Promise<number> {
 *     // Implementation to get next value from PostgreSQL sequence
 *     const result = await this.options.executor.raw(`SELECT nextval('${this.options.name}')`);
 *     return parseInt(result.rows[0].nextval);
 *   }
 *
 *   async current(): Promise<number> {
 *     // Implementation to get current value from PostgreSQL sequence
 *     const result = await this.options.executor.raw(`SELECT currval('${this.options.name}')`);
 *     return parseInt(result.rows[0].currval);
 *   }
 *
 *   async range(count: number): Promise<number[]> {
 *     // Implementation to get a range of values
 *     const values: number[] = [];
 *     for (let i = 0; i < count; i++) {
 *       values.push(await this.next());
 *     }
 *     return values;
 *   }
 * }
 *
 * // Usage
 * const sequence = new PostgresSequence({
 *   name: 'user_id_seq',
 *   executor: dbExecutor
 * });
 *
 * const nextId = await sequence.next();
 * ```
 */
export class FabricContractSequence extends Sequence {
  /**
   * @description Creates a new sequence instance
   * @summary Protected constructor that initializes the sequence with the provided options
   */
  constructor(options: SequenceOptions, adapter: Adapter<any, any, any>) {
    super(options, adapter);
  }

  /**
   * @description Retrieves the current value of the sequence
   * @summary Gets the current value of the sequence from storage. If the sequence
   * doesn't exist yet, it returns the configured starting value.
   * @return A promise that resolves to the current sequence value
   */
  override async current(
    ...args: MaybeContextualArg<any>
  ): Promise<string | number | bigint> {
    const { ctx, log } = (
      await this.logCtx(args, OperationKeys.READ, true)
    ).for(this.current);
    let cachedCurrent: any;
    const { name, startWith } = this.options;
    const adapterMeta = (ctx as FabricContractContext).getSequenceSegregation(
      String(name)
    );
    try {
      cachedCurrent = ctx.getFromChildren(name as any);
      if (cachedCurrent !== undefined && cachedCurrent !== null)
        return this.parse(cachedCurrent);
      const sequence: SequenceModel = await this.repo.read(name as string, ctx);
      return this.parse(sequence.current as string | number);
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        // If the sequence is supposed to live in private/shared collections,
        // read it from those collections using the adapter (not the stub directly).
        if (adapterMeta?.collections?.length) {
          const adapter = this.adapter as unknown as FabricContractAdapter;
          const tableName = Model.tableName(SequenceModel as any);
          const publicKey = (ctx as FabricContractContext).stub.createCompositeKey(
            tableName,
            [String(name)]
          );
          for (const col of adapterMeta.collections) {
            try {
              const privateAdapter = adapter.forPrivate(col);
              const raw = await (privateAdapter as any).readState(
                publicKey,
                ctx as any
              );
              if (raw && raw.current !== undefined && raw.current !== null)
                return this.parse(raw.current as any);
            } catch (err: any) {
              if (err instanceof NotFoundError) continue;
              // fall through to regular startWith fallback for any parse/IO errors
            }
          }
        }
        try {
          log.debug(
            `Trying to resolve current sequence ${name} value from context tree`
          );
          cachedCurrent = ctx.getFromChildren(name as any);
          if (cachedCurrent !== undefined && cachedCurrent !== null) {
            log.debug(
              `Retrieved cached current value for sequence ${name}: ${cachedCurrent}`
            );
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          // fall through
        }
        if (cachedCurrent === undefined || cachedCurrent === null) {
          log.info(`No cached value for sequence ${name} in context`);
          cachedCurrent = startWith;
        }
        try {
          return this.parse(cachedCurrent);
        } catch (e: any) {
          throw new InternalError(
            `Failed to parse initial value for sequence ${startWith}: ${e}`
          );
        }
      }
      throw new InternalError(
        `Failed to retrieve current value for sequence ${name}: ${e}`
      );
    }
  }

  /**
   * @description Increments the sequence value
   * @summary Increases the current sequence value by the specified amount and persists
   * the new value to storage. This method handles both numeric and BigInt sequence types.
   * @param {string | number | bigint} current - The current value of the sequence
   * @param {number} [count] - Optional amount to increment by, defaults to the sequence's incrementBy value
   * @return A promise that resolves to the new sequence value after incrementing
   */
  protected override async increment(
    count: number | undefined,
    ctx: Context<any>
  ): Promise<string | number | bigint> {
    const log = ctx.logger.for(this.increment);
    const { type, incrementBy, name } = this.options;
    if (!name) throw new InternalError("Sequence name is required");
    log.info(`Obtaining sequence lock for sequence ${name}`);
    // return FabricContractSequence.lock.execute(async () => {
    const toIncrementBy = count || incrementBy;
    if (toIncrementBy % incrementBy !== 0)
      throw new InternalError(
        `Value to increment does not consider the incrementBy setting: ${incrementBy}`
      );
    const typeName =
      typeof type === "function" && (type as any)?.name
        ? (type as any).name
        : type;
    const currentValue = await this.current(ctx);

    async function returnAndCache(res: SequenceModel | Promise<SequenceModel>) {
      if (res instanceof Promise) res = await res;
      log
        .for(returnAndCache)
        .info(`Storing new ${name} seq value in cache: ${res.current}`);
      ctx.cache.put(name as string, res.current);
      return res;
    }

    const performUpsert = async (
      next: string | number | bigint
    ): Promise<SequenceModel> => {
      try {
        return await returnAndCache(
          this.repo.update(new SequenceModel({ id: name, current: next }), ctx)
        );
      } catch (e: any) {
        if (e instanceof NotFoundError) {
          return await returnAndCache(
            this.repo.create(
              new SequenceModel({ id: name, current: next }),
              ctx
            )
          );
        }
        throw e;
      }
    };

    const incrementSerial = async (
      base: string | number | bigint
    ): Promise<string | number | bigint> => {
      switch (typeName) {
        case Number.name:
          return (this.parse(base) as number) + toIncrementBy;
        case BigInt.name:
          return (this.parse(base) as bigint) + BigInt(toIncrementBy);
        case String.name:
          return this.parse(base);
        case "serial":
          return await Promise.resolve(
            Serial.instance.generate(base as string)
          );
        default:
          throw new InternalError("Should never happen");
      }
    };

    // Check if model is fully segregated — sequence goes ONLY to private collections.
    // Prefer the explicit per-sequence metadata when available; otherwise fall back to
    // the context's registered read collections (covers early pk generation paths).
    const adapterMeta = (ctx as FabricContractContext).getSequenceSegregation(
      name
    );
    const fallbackCollections = (ctx as FabricContractContext)
      .getReadCollections()
      .filter(Boolean);
    const effectiveCollections =
      adapterMeta?.collections?.length ? adapterMeta.collections : fallbackCollections;
    const effectiveFullySegregated =
      (adapterMeta?.fullySegregated ?? (ctx as FabricContractContext).isFullySegregated) &&
      effectiveCollections.length > 0;

    let next: any;
    if (typeName === "uuid") {
      throw new UnsupportedError(
        `uuid pk generation is only supported using @uuid and a deterministic seed`
      );
    } else {
      next = await incrementSerial(currentValue);
    }

    if (effectiveFullySegregated) {
      const seqModel = new SequenceModel({ id: name, current: next });
      await this.writeSequenceToCollections(
        ctx,
        seqModel,
        effectiveCollections
      );
      log.debug(
        `Sequence.increment (private-only) ${name} current=${currentValue as any} next=${next as any}`
      );
      ctx.cache.put(name as string, next);
      return next;
    }

    const seq = await performUpsert(next);
    log.debug(
      `Sequence.increment ${name} current=${currentValue as any} next=${next as any}`
    );

    // Replicate sequence to segregated collections if model uses private/shared data.
    // When metadata isn't available, fall back to the context's registered read collections.
    if (effectiveCollections.length) {
      await this.writeSequenceToCollections(ctx, seq, effectiveCollections);
    }

    return seq.current as string | number | bigint;
    // }, name);
  }

  /**
   * @description Ensures the sequence exists and is at least a given value
   * @summary Fabric needs to respect segregated/private/shared storage rules when creating
   * sequences (for example for persistent @version(true) and @sequence()).
   */
  override async ensureAtLeast(
    value: string | number | bigint,
    ...args: MaybeContextualArg<any>
  ): Promise<string | number | bigint> {
    const { ctx, log } = (
      await this.logCtx(args, OperationKeys.UPDATE, true)
    ).for(this.ensureAtLeast);
    const { name } = this.options;
    if (!name) throw new InternalError("Sequence name is required");

    const desired = this.parse(value);

    const greaterThan = (
      a: string | number | bigint,
      b: string | number | bigint
    ): boolean => {
      if (typeof a === "bigint" || typeof b === "bigint") {
        return BigInt(a as any) > BigInt(b as any);
      }
      if (typeof a === "number" || typeof b === "number") {
        return Number(a) > Number(b);
      }
      return String(a) > String(b);
    };

    const adapterMeta = (ctx as FabricContractContext).getSequenceSegregation(
      String(name)
    );
    const isFullySegregated =
      adapterMeta !== undefined &&
      adapterMeta.fullySegregated &&
      adapterMeta.collections.length > 0;

    const readExisting = async (): Promise<SequenceModel | undefined> => {
      try {
        return await this.repo.read(name as string, ctx);
      } catch (e: any) {
        if (e instanceof NotFoundError) return undefined;
        throw e;
      }
    };

    const writePrivate = async (
      seqModel: SequenceModel,
      collections: string[]
    ) => {
      await this.writeSequenceToCollections(ctx, seqModel, collections);
      ctx.cache.put(name as string, seqModel.current);
    };

    const upsertPublic = async (next: string | number | bigint) => {
      try {
        return await this.repo.update(
          new SequenceModel({ id: name, current: next }),
          ctx
        );
      } catch (e: any) {
        if (e instanceof NotFoundError) {
          return await this.repo.create(
            new SequenceModel({ id: name, current: next }),
            ctx
          );
        }
        throw e;
      }
    };

    const existing = await readExisting();
    if (!existing) {
      const seqModel = new SequenceModel({ id: name, current: desired });
      if (isFullySegregated) {
        await writePrivate(seqModel, adapterMeta!.collections);
        return desired;
      }
      const created = await upsertPublic(desired);
      await this.replicateToSegregatedCollections(ctx, created);
      return this.parse(created.current as any);
    }

    const current = this.parse(existing.current as any);
    if (!greaterThan(desired, current)) {
      return current;
    }

    const seqModel = new SequenceModel({ id: name, current: desired });
    if (isFullySegregated) {
      await writePrivate(seqModel, adapterMeta!.collections);
      log.debug(
        `Sequence.ensureAtLeast (private-only) ${name} current=${current as any} desired=${desired as any}`
      );
      return desired;
    }

    const updated = await upsertPublic(desired);
    await this.replicateToSegregatedCollections(ctx, updated);
    return this.parse(updated.current as any);
  }

  /**
   * @description Replicates the sequence to all segregated collections
   * @summary When a model uses privateData or sharedData decorators, its sequence must be
   * replicated to all collections the model is stored in. This ensures clients with access
   * to only one collection can still read the model's sequence, while clients without
   * access to any collection won't see the sequence on the public chain.
   * @param {Context<any>} ctx - The execution context
   * @param {SequenceModel} seq - The sequence model to replicate
   */
  private async writeSequenceToCollections(
    ctx: Context<any>,
    seq: SequenceModel,
    collections: string[]
  ): Promise<void> {
    const log = ctx.logger.for(this.writeSequenceToCollections);
    const adapter = this.adapter as unknown as FabricContractAdapter;
    const tableName = Model.tableName(SequenceModel as any);
    const composedKey = (ctx as FabricContractContext).stub.createCompositeKey(
      tableName,
      [String(seq.id)]
    );

    for (const collection of collections) {
      try {
        const privateAdapter = adapter.forPrivate(collection);
        const record = {
          [CouchDBKeys.TABLE]: tableName,
          id: seq.id,
          current: seq.current,
        };
        await privateAdapter["putState"](composedKey, record, ctx as any);
        log.debug(`Sequence ${seq.id} written to collection ${collection}`);
      } catch (e: unknown) {
        log.warn(
          `Failed to write sequence ${seq.id} to collection ${collection}: ${e}`
        );
      }
    }
  }

  private async replicateToSegregatedCollections(
    ctx: Context<any>,
    seq: SequenceModel
  ): Promise<void> {
    // Use adapter metadata instead of ctx.getReadCollections() because the Sequence
    // creates its own context via logCtx, losing collections set by extractSegregatedCollections.
    const adapterMeta = (ctx as FabricContractContext).getSequenceSegregation(
      String(seq.id)
    );

    if (!adapterMeta || !adapterMeta.collections.length) {
      return;
    }

    // Only replicate for non-fully-segregated models (fully segregated is handled separately)
    if (adapterMeta.fullySegregated) {
      return;
    }

    const log = ctx.logger.for(this.replicateToSegregatedCollections);
    log.info(
      `Replicating sequence ${seq.id} to ${adapterMeta.collections.length} segregated collections: ${adapterMeta.collections.join(", ")}`
    );

    await this.writeSequenceToCollections(ctx, seq, adapterMeta.collections);
  }
}
