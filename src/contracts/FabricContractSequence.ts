import {
  Context,
  InternalError,
  NotFoundError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Adapter, Repository, SequenceOptions } from "@decaf-ts/core";
import { Sequence } from "@decaf-ts/core";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractContext } from "./ContractContext";
import { FabricContractRepository } from "./FabricContractRepository";
import { MissingContextError } from "../shared/errors";
import { CustomizableSequence } from "./PrivateSequence";
import { privateData } from "../shared/decorators";

/**
 * @description Abstract implementation of a Sequence for Fabric contracts
 * @summary Provides the basic functionality for sequences backed by the FabricContractRepository storing values in CouchDB-like state, including current, next and range operations.
 * @param {SequenceOptions} options - Sequence configuration such as name, type, startWith and incrementBy
 * @return {void}
 * @class FabricContractSequence
 * @example
 * const seq = new FabricContractDBSequence({ name: 'orderSeq', type: 'Number', incrementBy: 1, startWith: 1 }, adapter);
 * const next = await seq.next(ctx); // 1
 * const [a,b,c] = await seq.range(3, ctx); // [2,3,4]
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Sequence
 *   participant Repo
 *   App->>Sequence: next(ctx)
 *   Sequence->>Repo: read(name, ctx)
 *   Repo-->>Sequence: current
 *   Sequence->>Repo: update(current+inc)
 *   Repo-->>Sequence: saved
 *   Sequence-->>App: next value
 */
export class FabricContractSequence extends Sequence {
  protected repo: FabricContractRepository<CustomizableSequence>;

  constructor(
    options: SequenceOptions,
    adapter: Adapter<any, any, MangoQuery, any, any>,
    collections?: string[]
  ) {
    super(options);

    for (const collection of collections || []) {
      privateData(collection)(CustomizableSequence);
    }

    this.repo = Repository.forModel(CustomizableSequence, adapter.alias);
  }

  /**
   * @summary Retrieves the current value for the sequence
   * @protected
   */
  async current(
    ctx?: Context<RepositoryFlags>
  ): Promise<string | number | bigint> {
    if (!ctx) throw new MissingContextError("Context is required");
    const { name, startWith } = this.options;
    try {
      const sequence: CustomizableSequence = await this.repo.read(
        name as string,
        ctx
      );
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
   * @summary Parses the {@link Sequence} value
   *
   * @protected
   * @param value
   */
  private parse(value: string | number | bigint): string | number | bigint {
    return Sequence.parseValue(this.options.type, value);
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
    count?: number,
    ctx?: FabricContractContext
  ): Promise<string | number | bigint> {
    if (!ctx) throw new MissingContextError("Context is required");
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
    let seq: CustomizableSequence;
    try {
      seq = await this.repo.update(
        new CustomizableSequence({ id: name, current: next }),
        ctx
      );
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) throw e;
      seq = await this.repo.create(
        new CustomizableSequence({ id: name, current: next }),
        ctx
      );
    }

    return seq.current as string | number | bigint;
  }

  /**
   * @summary Generates the next value in th sequence
   * @description calls {@link Sequence#parse} on the current value
   * followed by {@link Sequence#increment}
   *
   */
  async next(ctx?: FabricContractContext): Promise<number | string | bigint> {
    if (!ctx) throw new MissingContextError("Context is required");
    const current = await this.current(ctx);
    return this.increment(current, undefined, ctx);
  }

  async range(
    count: number,
    ctx?: FabricContractContext
  ): Promise<(number | string | bigint)[]> {
    if (!ctx) throw new MissingContextError("Context is required");
    const current = (await this.current(ctx)) as number;
    const incrementBy = this.parse(this.options.incrementBy) as number;
    const next: string | number | bigint = await this.increment(
      current,
      (this.parse(count) as number) * incrementBy,
      ctx
    );
    const range: (number | string | bigint)[] = [];
    for (let i: number = 1; i <= count; i++) {
      range.push(current + incrementBy * (this.parse(i) as number));
    }
    if (range[range.length - 1] !== next)
      throw new InternalError("Miscalculation of range");
    return range;
  }
}
