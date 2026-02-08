import {
  ConflictError,
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  Adapter,
  Context,
  MaybeContextualArg,
  Sequence,
  SequenceModel,
  SequenceOptions,
  Serial,
  UUID,
} from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import type { FabricContractAdapter } from "./ContractAdapter";

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
    try {
      cachedCurrent = ctx.getOrUndefined(name);
      if (cachedCurrent) return this.parse(cachedCurrent);
      const sequence: SequenceModel = await this.repo.read(name as string, ctx);
      return this.parse(sequence.current as string | number);
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        try {
          log.debug(
            `Trying to resolve current sequence ${name} value from context`
          );
          cachedCurrent = ctx.get(name);
          log.debug(
            `Retrieved cached current value for sequence ${name}: ${cachedCurrent}`
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
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
    return FabricContractSequence.lock.execute(async () => {
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

      async function returnAndCache(
        res: SequenceModel | Promise<SequenceModel>
      ) {
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
            this.repo.update(
              new SequenceModel({ id: name, current: next }),
              ctx
            )
          );
        } catch (e: any) {
          if (e instanceof NotFoundError) {
            log.debug(
              `Sequence create ${name} current=${currentValue as any} next=${next as any}`
            );
            return returnAndCache(
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

      if (typeName === "uuid") {
        while (true) {
          const next = await UUID.instance.generate(currentValue as string);
          try {
            const result = await performUpsert(next);
            log.debug(
              `Sequence uuid increment ${name} current=${currentValue as any} next=${next as any}`
            );
            return result.current as string | number | bigint;
          } catch (e: unknown) {
            if (e instanceof ConflictError) continue;
            throw e;
          }
        }
      }

      const next = await incrementSerial(currentValue);
      const seq = await performUpsert(next);
      log.debug(
        `Sequence.increment ${name} current=${currentValue as any} next=${next as any}`
      );

      // Replicate sequence to segregated collections if model uses private/shared data
      await this.replicateToSegregatedCollections(ctx, seq);

      return seq.current as string | number | bigint;
    }, name);
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
  private async replicateToSegregatedCollections(
    ctx: Context<any>,
    seq: SequenceModel
  ): Promise<void> {
    if (!(ctx instanceof FabricContractContext)) {
      return;
    }

    const collections = ctx.getReadCollections();
    if (!collections.length) {
      return;
    }

    const log = ctx.logger.for(this.replicateToSegregatedCollections);
    log.info(
      `Replicating sequence ${seq.id} to ${collections.length} segregated collections: ${collections.join(", ")}`
    );

    const adapter = this.adapter as unknown as FabricContractAdapter;
    const tableName = "sequence";
    const composedKey = ctx.stub.createCompositeKey(tableName, [
      String(seq.id),
    ]);

    for (const collection of collections) {
      try {
        const privateAdapter = adapter.forPrivate(collection);
        const record = {
          $$table: tableName,
          id: seq.id,
          current: seq.current,
        };
        await privateAdapter["putState"](composedKey, record, ctx);
        log.debug(`Sequence ${seq.id} replicated to collection ${collection}`);
      } catch (e: unknown) {
        log.warn(
          `Failed to replicate sequence ${seq.id} to collection ${collection}: ${e}`
        );
        // Continue with other collections even if one fails
      }
    }
  }
}
