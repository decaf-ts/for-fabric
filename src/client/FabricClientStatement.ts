import {
  AdapterFlags,
  Condition,
  Context,
  ContextOf,
  DirectionLimitOffset,
  MaybeContextualArg,
  OrderBySelector,
  OrderDirection,
  PersistenceKeys,
  PreparedStatement,
  PreparedStatementKeys,
  QueryClause,
  Repository,
  Statement,
  StatementExecutor,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "./FabricClientAdapter";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricClientFlags } from "./types";
import { toCamelCase } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";

export class FabricClientStatement<M extends Model, R> extends Statement<
  M,
  FabricClientAdapter,
  R,
  MangoQuery
> {
  constructor(adapter: FabricClientAdapter, overrides?: Partial<AdapterFlags>) {
    super(adapter, overrides);
  }

  protected override squash(
    ctx: Context<FabricClientFlags>
  ): PreparedStatement<any> | undefined {
    const squashed: PreparedStatement<M> | undefined = super.squash(
      ctx as never
    );
    if (!squashed) return squashed;

    const { method, params, args } = squashed;
    const { direction, limit } = params;
    switch (method) {
      case PreparedStatementKeys.FIND_BY:
        break;
      case PreparedStatementKeys.LIST_BY:
        args.push(direction);
        break;
      case PreparedStatementKeys.PAGE_BY:
        args.push(direction, limit);
        break;
      case PreparedStatementKeys.FIND_ONE_BY:
        break;
      default:
        throw new InternalError(`Unsupported method ${method}`);
    }

    return squashed;
  }

  protected override async executePrepared(
    ...argz: MaybeContextualArg<Context<FabricClientFlags>>
  ): Promise<R> {
    const repo = Repository.forModel(this.fromSelector, this.adapter.alias);
    const { method, args } = this.prepared as PreparedStatement<any>;
    return repo.statement(method, ...args, ...argz);
  }

  override async prepare(
    ctx?: Context<FabricClientFlags>
  ): Promise<StatementExecutor<M, R>> {
    ctx =
      ctx ||
      (await this.adapter.context(
        PersistenceKeys.QUERY,
        this.overrides || {},
        this.fromSelector
      ));

    if (
      this.isSimpleQuery() &&
      (ctx as Context<FabricClientFlags>).get("forcePrepareSimpleQueries")
    ) {
      const squashed = this.squash(ctx as Context<FabricClientFlags>);
      if (squashed) {
        this.prepared = squashed;
        return this;
      }
    }
    const args: (string | number)[] = [];
    const params: any = {} as any;

    const prepared: PreparedStatement<any> = {
      class: this.fromSelector,
      args,
      params,
    } as any;

    const method: string[] = [QueryClause.FIND_BY];

    if (this.whereCondition) {
      const parsed = this.prepareCondition(this.whereCondition, ctx as never);
      method.push(parsed.method);
      if (parsed.args && parsed.args.length)
        args.push(...(parsed.args as (string | number)[]));
    }
    if (this.selectSelector)
      method.push(
        QueryClause.SELECT,
        this.selectSelector.join(` ${QueryClause.AND.toLowerCase()} `)
      );
    if (this.orderBySelector) {
      method.push(QueryClause.ORDER_BY, this.orderBySelector[0] as string);
      args.push(this.orderBySelector[1]);
    }
    // if (this.groupBySelector)
    //   method.push(QueryClause.GROUP_BY, this.groupBySelector as string);
    // if (this.limitSelector) params.limit = this.limitSelector;
    // if (this.offsetSelector) {
    //   params.skip = this.offsetSelector;
    // }
    prepared.method = toCamelCase(method.join(" "));
    prepared.params = params;
    this.prepared = prepared;
    return this;
  }

  protected override build(): MangoQuery {
    throw new UnsupportedError(
      `This method is only called is prepared statements are not used. If so, a dedicated implementation for the native queries used is required`
    );
  }

  protected override parseCondition(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    condition: Condition<M>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): MangoQuery {
    throw new UnsupportedError(
      `This method is only called is prepared statements are not used. Is so, a dedicated implementation for the native queries used is required`
    );
  }
}
