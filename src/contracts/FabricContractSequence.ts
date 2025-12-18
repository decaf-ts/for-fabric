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
import {
  ConflictError,
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";

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
  constructor(options: SequenceOptions, adapter: Adapter<any, any, any, any>) {
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
      if (e instanceof NotFoundError) {
        if (typeof startWith === "undefined")
          throw new InternalError(
            "Starting value is not defined for a non existing sequence"
          );
        try {
          return this.parse(startWith);
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
    current: string | number | bigint,
    count: number | undefined,
    ctx: Context<any>
  ): Promise<string | number | bigint> {
    const { type, incrementBy, name } = this.options;
    let next: string | number | bigint;
    const toIncrementBy = count || incrementBy;
    if (toIncrementBy % incrementBy !== 0)
      throw new InternalError(
        `Value to increment does not consider the incrementBy setting: ${incrementBy}`
      );
    const typeName =
      typeof type === "function" && (type as any)?.name
        ? (type as any).name
        : type;
    switch (typeName) {
      case Number.name:
        next = (this.parse(current) as number) + toIncrementBy;
        break;
      case BigInt.name:
        next = (this.parse(current) as bigint) + BigInt(toIncrementBy);
        break;
      case String.name:
        next = this.parse(current);
        break;
      case "serial":
        next = Serial.instance.generate(current as string);
        break;
      case "uuid":
        next = UUID.instance.generate(current as string);
        break;
      default:
        throw new InternalError("Should never happen");
    }
    let seq: SequenceModel;
    // const repo = this.repo.override({
    //   ignoredValidationProperties: ["updatedAt"],
    // });
    try {
      seq = await this.repo.update(
        new SequenceModel({ id: name, current: next }),
        ctx
      );
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
      try {
        seq = await this.repo.create(
          new SequenceModel({ id: name, current: next }),
          ctx
        );
      } catch (e: unknown) {
        if (!(e instanceof ConflictError) || type !== "uuid") throw e;
        return this.increment(current, count, ctx); // retries uuids in case of conflict
      }
    }

    return seq.current as string | number | bigint;
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
    const { context, args } = contextArgs;
    const current = await this.current(...args);
    return this.increment(current, undefined, context);
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
    const current = (await this.current(...args)) as number;
    const incrementBy = this.parse(
      this.options.incrementBy as number
    ) as number;
    const next: string | number | bigint = await this.increment(
      current,
      (this.parse(count) as number) * incrementBy,
      context
    );
    const range: (number | string | bigint)[] = [];
    for (let i: number = 1; i <= count; i++) {
      range.push(current + incrementBy * (this.parse(i) as number));
    }

    if (this.options.type === "uuid" || this.options.type === "serial")
      throw new UnsupportedError(
        `type ${this.options.type} is currently not suppported for this adapter`
      );
    const typeName =
      typeof this.options.type === "function" &&
      (this.options.type as any)?.name
        ? (this.options.type as any).name
        : this.options.type;

    if (range[range.length - 1] !== next && typeName !== "String")
      throw new InternalError("Miscalculation of range");
    return range;
  }
}
