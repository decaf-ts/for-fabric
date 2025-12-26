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
  UnsupportedError,
  UUID,
} from "@decaf-ts/core";

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
    const contextArgs = await Context.args<any, any>(
      OperationKeys.READ,
      SequenceModel,
      args,
      this.adapter
    );
    const ctx = contextArgs.context;
    const { name, startWith } = this.options;
    try {
      const sequence: SequenceModel = await this.repo.read(name as string, ctx);
      return this.parse(sequence.current as string | number);
    } catch (e: any) {
      const log = ctx.logger.for(this.current);
      if (e instanceof NotFoundError) {
        let cachedCurrent: any;
        try {
          cachedCurrent = ctx.get(name);
          log.info(
            `Retrieved cached current value for sequence ${name}: ${cachedCurrent}`
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          cachedCurrent = startWith;
        }

        log.debug(
          `Sequence.current missing ${name}, returning startWith=${cachedCurrent}`
        );
        if (typeof cachedCurrent === "undefined")
          throw new InternalError(
            "Starting value is not defined for a non existing sequence"
          );
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
        ctx.logger
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

      const incrementSerial = (
        base: string | number | bigint
      ): string | number | bigint => {
        switch (typeName) {
          case Number.name:
            return (this.parse(base) as number) + toIncrementBy;
          case BigInt.name:
            return (this.parse(base) as bigint) + BigInt(toIncrementBy);
          case String.name:
            return this.parse(base);
          case "serial":
            return Serial.instance.generate(base as string);
          default:
            throw new InternalError("Should never happen");
        }
      };

      if (typeName === "uuid") {
        while (true) {
          const next = UUID.instance.generate(currentValue as string);
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

      const next = incrementSerial(currentValue);
      const seq = await performUpsert(next);
      log.debug(
        `Sequence.increment ${name} current=${currentValue as any} next=${next as any}`
      );
      return seq.current as string | number | bigint;
    }, name);
  }

  /**
   * @description Gets the next value in the sequence
   * @summary Retrieves the current value of the sequence and increments it by the
   * configured increment amount. This is the main method used to get a new sequential value.
   * @return A promise that resolves to the next value in the sequence
   */
  override async next(
    ...argz: MaybeContextualArg<any>
  ): Promise<number | string | bigint> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      SequenceModel,
      argz,
      this.adapter
    );
    const { context } = contextArgs;
    return this.increment(undefined, context);
  }

  /**
   * @description Generates a range of sequential values
   * @summary Retrieves a specified number of sequential values from the sequence.
   * This is useful when you need to allocate multiple IDs at once.
   * The method increments the sequence by the total amount needed and returns all values in the range.
   * @param {number} count - The number of sequential values to generate
   * @return A promise that resolves to an array of sequential values
   */
  override async range(
    count: number,
    ...argz: MaybeContextualArg<any>
  ): Promise<(number | string | bigint)[]> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      SequenceModel,
      argz,
      this.adapter
    );
    const { context, args } = contextArgs;

    const log = context.logger.for(this.range);

    if (this.options.type === "uuid" || this.options.type === "serial")
      throw new UnsupportedError( // TODO just generate valid uuids/serials
        `type ${this.options.type} is currently not suppported for this adapter`
      );

    const typeName =
      typeof this.options.type === "function" &&
      (this.options.type as any)?.name
        ? (this.options.type as any).name
        : this.options.type;

    log.info(`Obtaining sequence range for ${typeName}`);

    const current = (await this.current(...args)) as number;

    log.info(`current value is ${current}`);
    const incrementBy = this.parse(
      this.options.incrementBy as number
    ) as number;
    const next: string | number | bigint = await this.increment(
      (this.parse(count) as number) * incrementBy,
      context
    );
    const range: (number | string | bigint)[] = [];
    for (let i: number = 1; i <= count; i++) {
      range.push(current + incrementBy * (this.parse(i) as number));
    }

    log.info(`Calculated range: ${range.join(", ")}`);

    if (range[range.length - 1] !== next && typeName !== "String")
      throw new InternalError("Miscalculation of range");

    return range;
  }
}
