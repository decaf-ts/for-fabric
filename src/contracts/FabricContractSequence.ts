import {
  Context,
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  Adapter,
  MaybeContextualArg,
  Repository,
  SequenceOptions,
} from "@decaf-ts/core";
import { Sequence } from "@decaf-ts/core";
import { SequenceModel } from "../shared/model/Sequence";
import { FabricContractRepository } from "./FabricContractRepository";
import { FabricContractContext } from "./ContractContext";
/**
 * @summary Abstract implementation of a Sequence
 * @description provides the basic functionality for {@link Sequence}s
 *
 * @param {SequenceOptions} options
 *
 * @class CouchDBSequence
 * @implements Sequence
 */
export class FabricContractSequence extends Sequence {
  protected repo: FabricContractRepository<SequenceModel>;

  constructor(
    options: SequenceOptions,
    adapter: Adapter<any, void, FabricContractContext>
  ) {
    super(options, adapter);
    this.repo = Repository.forModel(SequenceModel, adapter.alias) as any;
  }

  /**
   * @summary Retrieves the current value for the sequence
   * @protected
   */
  async current(
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
        } catch (e: unknown) {
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
   * @summary increments the sequence
   * @description Sequence specific implementation
   *
   * @param {string | number | bigint} current
   * @param count
   * @protected
   */
  private async increment(
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
    switch (type) {
      case "Number":
        next = (this.parse(current) as number) + toIncrementBy;
        break;
      case "BigInt":
        next = (this.parse(current) as bigint) + BigInt(toIncrementBy);
        break;
      default:
        throw new InternalError("Should never happen");
    }
    let seq: SequenceModel;
    try {
      seq = await this.repo.update(
        new SequenceModel({ id: name, current: next }),
        ctx
      );
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) throw e;
      seq = await this.repo.create(
        new SequenceModel({ id: name, current: next }),
        ctx
      );
    }

    return seq.current as string | number | bigint;
  }

  /**
   * @description Gets the next value in the sequence
   * @summary Retrieves the current value of the sequence and increments it by the
   * configured increment amount. This is the main method used to get a new sequential value.
   * @return A promise that resolves to the next value in the sequence
   */
  async next(
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
  async range(
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
    if (range[range.length - 1] !== next && this.options.type !== "String")
      throw new InternalError("Miscalculation of range");
    return range;
  }
}
