import {
  AdapterFlags,
  Condition,
  Context,
  GroupOperator,
  MaybeContextualArg,
  Operator,
  OrderDirection,
  PersistenceKeys,
  PreparedStatement,
  PreparedStatementKeys,
  QueryClause,
  QueryError,
  Repository,
  SelectSelector,
  Sequence,
  Statement,
  StatementExecutor,
  ViewKind,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "./FabricClientAdapter";
import {
  CouchDBKeys,
  CouchDBOperator,
  CouchDBGroupOperator,
  CouchDBQueryLimit,
  MangoQuery,
  MangoOperator,
  MangoSelector,
  translateOperators,
  generateDesignDocName,
  generateViewName,
  findViewMetadata,
  CouchDBViewMetadata,
  ViewResponse,
} from "@decaf-ts/for-couchdb";
import { FabricClientFlags } from "./types";
import { toCamelCase } from "@decaf-ts/logging";
import { DBKeys, InternalError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";

type FabricViewDescriptor = {
  ddoc: string;
  view: string;
  options: Record<string, any>;
};

type FabricAggregateInfo =
  | {
      kind: ViewKind;
      meta: CouchDBViewMetadata;
      descriptor: FabricViewDescriptor;
      countDistinct?: boolean;
    }
  | {
      kind: "avg";
      attribute: string;
      sumDescriptor: FabricViewDescriptor;
      countDescriptor: FabricViewDescriptor;
    };

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nextLexicographicString(value: string): string {
  if (!value) return "\u0000";
  const chars = Array.from(value);
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i].codePointAt(0);
    if (code === undefined) continue;
    if (code < 0x10ffff) {
      chars[i] = String.fromCodePoint(code + 1);
      return chars.slice(0, i + 1).join("");
    }
  }
  return `${value}\u0000`;
}

function prefixRange(prefix: string) {
  return {
    start: prefix,
    end: nextLexicographicString(prefix),
  };
}

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
      case PreparedStatementKeys.FIND:
        break;
      case PreparedStatementKeys.PAGE:
        args.push(direction, limit);
        break;
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
    if (this.orderBySelectors?.length) {
      method.push(QueryClause.ORDER_BY, this.orderBySelectors[0][0] as string);
      args.push(this.orderBySelectors[0][1] as any);
    }
    prepared.method = toCamelCase(method.join(" "));
    prepared.params = params;
    this.prepared = prepared;
    return this;
  }

  /**
   * @description Processes a record from CouchDB/Fabric
   * @summary Extracts the ID from a CouchDB document and reverts it to a model instance
   */
  protected processRecord(
    r: any,
    pkAttr: keyof M,
    sequenceType: "Number" | "BigInt" | undefined,
    ctx: Context<FabricClientFlags>
  ) {
    if (r[CouchDBKeys.ID]) {
      const [, ...keyArgs] = r[CouchDBKeys.ID].split(CouchDBKeys.SEPARATOR);
      const id = keyArgs.join("_");
      return this.adapter.revert(
        r,
        this.fromSelector,
        Sequence.parseValue(sequenceType, id),
        undefined,
        ctx
      );
    }
    return r;
  }

  /**
   * @description Executes a raw Mango query
   * @summary Sends a raw Mango query to Fabric and processes the results
   */
  override async raw<R>(rawInput: MangoQuery, ...args: any[]): Promise<R> {
    const { ctx } = this.logCtx(args, this.raw);
    const aggregator = (rawInput as any)?.aggregateInfo;
    if ((rawInput as any)?.aggregate && aggregator) {
      return this.executeAggregate<R>(aggregator, ctx);
    }
    const results: any[] = await this.adapter.raw(
      rawInput,
      true,
      this.fromSelector,
      ctx
    );

    const pkAttr = Model.pk(this.fromSelector);
    const type = Metadata.get(
      this.fromSelector,
      Metadata.key(DBKeys.ID, pkAttr as string)
    )?.type;

    if (!this.selectSelector)
      return results.map((r) => this.processRecord(r, pkAttr, type, ctx)) as R;
    return results as R;
  }

  /**
   * @description Builds a CouchDB Mango query from the statement
   * @summary Converts the statement's conditions, selectors, and options into a CouchDB Mango query
   */
  protected override build(): MangoQuery {
    const log = this.log.for(this.build);
    const aggregateQuery = this.buildAggregateQuery();
    if (aggregateQuery) return aggregateQuery;
    const selectors: MangoSelector = {};
    selectors[CouchDBKeys.TABLE] = {};
    selectors[CouchDBKeys.TABLE] = Model.tableName(this.fromSelector);
    const query: MangoQuery = { selector: selectors };
    if (this.selectSelector) query.fields = this.selectSelector as string[];

    if (this.whereCondition) {
      const condition: MangoSelector = this.parseCondition(
        Condition.and(
          this.whereCondition,
          Condition.attribute<M>(CouchDBKeys.TABLE as keyof M).eq(
            query.selector[CouchDBKeys.TABLE]
          )
        )
      ).selector;
      const selectorKeys = Object.keys(condition) as MangoOperator[];
      if (
        selectorKeys.length === 1 &&
        Object.values(CouchDBGroupOperator).indexOf(selectorKeys[0]) !== -1
      )
        switch (selectorKeys[0]) {
          case CouchDBGroupOperator.AND:
            condition[CouchDBGroupOperator.AND] = [
              ...Object.values(
                condition[CouchDBGroupOperator.AND] as MangoSelector
              ).reduce((accum: MangoSelector[], val: any) => {
                const keys = Object.keys(val);
                if (keys.length !== 1)
                  throw new Error(
                    "Too many keys in query selector. should be one"
                  );
                const k = keys[0];
                if (k === CouchDBGroupOperator.AND)
                  accum.push(...(val[k] as any[]));
                else accum.push(val);
                return accum;
              }, []),
            ];
            query.selector = condition;
            break;
          case CouchDBGroupOperator.OR: {
            const s: Record<any, any> = {};
            s[CouchDBGroupOperator.AND] = [
              condition,
              ...Object.entries(query.selector).map(([key, val]) => {
                const result: Record<any, any> = {};
                result[key] = val;
                return result;
              }),
            ];
            query.selector = s;
            break;
          }
          default:
            throw new Error("This should be impossible");
        }
      else {
        Object.entries(condition).forEach(([key, val]) => {
          if (query.selector[key])
            log.warn(
              `A ${key} query param is about to be overridden: ${query.selector[key]} by ${val}`
            );
          query.selector[key] = val;
        });
      }
    }

    if (this.orderBySelectors?.length) {
      query.sort = query.sort || [];
      query.selector = query.selector || ({} as MangoSelector);
      for (const [selectorKey, direction] of this.orderBySelectors) {
        const selector = selectorKey as string;
        const rec: Record<string, OrderDirection> = {};
        rec[selector] = direction as OrderDirection;
        (query.sort as Record<string, OrderDirection>[]).push(rec);
        if (!query.selector[selector]) {
          query.selector[selector] = {} as MangoSelector;
          (query.selector[selector] as MangoSelector)[CouchDBOperator.BIGGER] =
            null;
        }
      }
    }

    if (this.limitSelector) {
      query.limit = this.limitSelector;
    } else {
      log.warn(
        `No limit selector defined. Using default couchdb limit of ${CouchDBQueryLimit}`
      );
      query.limit = CouchDBQueryLimit;
    }

    if (this.offsetSelector) query.skip = this.offsetSelector;

    return query;
  }

  /**
   * @description Parses a condition into a CouchDB Mango query selector
   * @summary Converts a Condition object into a CouchDB Mango query selector structure
   */
  protected override parseCondition(condition: Condition<M>): MangoQuery {
    function merge(
      op: MangoOperator,
      obj1: MangoSelector,
      obj2: MangoSelector
    ): MangoQuery {
      const result: MangoQuery = { selector: {} as MangoSelector };
      result.selector[op] = [obj1, obj2];
      return result;
    }

    const { attr1, operator, comparison } = condition as unknown as {
      attr1: string | Condition<M>;
      operator: Operator | GroupOperator;
      comparison: any;
    };

    if (operator === Operator.STARTS_WITH) {
      if (typeof attr1 !== "string")
        throw new QueryError("STARTS_WITH requires an attribute name");
      if (typeof comparison !== "string")
        throw new QueryError("STARTS_WITH requires a string comparison");
      const range = prefixRange(comparison);
      const selector: MangoSelector = {} as MangoSelector;
      selector[attr1] = {} as MangoSelector;
      (selector[attr1] as MangoSelector)[CouchDBOperator.BIGGER_EQ] = range.start;
      (selector[attr1] as MangoSelector)[CouchDBOperator.SMALLER] = range.end;
      return { selector };
    }

    if (operator === Operator.ENDS_WITH) {
      if (typeof attr1 !== "string")
        throw new QueryError("ENDS_WITH requires an attribute name");
      if (typeof comparison !== "string")
        throw new QueryError("ENDS_WITH requires a string comparison");
      const selector: MangoSelector = {} as MangoSelector;
      selector[attr1] = {
        [CouchDBOperator.REGEXP]: `${escapeRegExp(comparison)}$`,
      } as MangoSelector;
      return { selector };
    }

    if (operator === Operator.BETWEEN) {
      const attr = attr1 as string;
      if (!Array.isArray(comparison) || comparison.length !== 2)
        throw new QueryError("BETWEEN operator requires [min, max] comparison");
      const [min, max] = comparison;
      const opBetween: MangoSelector = {} as MangoSelector;
      opBetween[attr] = {} as MangoSelector;
      (opBetween[attr] as MangoSelector)[
        translateOperators(Operator.BIGGER_EQ)
      ] = min;
      (opBetween[attr] as MangoSelector)[
        translateOperators(Operator.SMALLER_EQ)
      ] = max;
      return { selector: opBetween };
    }

    let op: MangoSelector = {} as MangoSelector;
    if (
      [GroupOperator.AND, GroupOperator.OR, Operator.NOT].indexOf(
        operator as GroupOperator
      ) === -1
    ) {
      op[attr1 as string] = {} as MangoSelector;
      (op[attr1 as string] as MangoSelector)[translateOperators(operator)] =
        comparison;
    } else if (operator === Operator.NOT) {
      op = this.parseCondition(attr1 as Condition<M>).selector as MangoSelector;
      op[translateOperators(Operator.NOT)] = {} as MangoSelector;
      (op[translateOperators(Operator.NOT)] as MangoSelector)[
        (attr1 as unknown as { attr1: string }).attr1
      ] = comparison;
    } else {
      const op1: any = this.parseCondition(attr1 as Condition<M>).selector;
      const op2: any = this.parseCondition(comparison as Condition<M>).selector;
      op = merge(translateOperators(operator), op1, op2).selector;
    }

    return { selector: op };
  }

  /**
   * @description Builds an aggregate query if aggregation is requested
   * @summary Checks for aggregate operations and returns a special MangoQuery for them
   */
  private buildAggregateQuery(): MangoQuery | undefined {
    if (!this.fromSelector) return undefined;
    if (this.avgSelector) {
      const attribute = String(this.avgSelector);
      const sumInfo = this.createAggregateDescriptor("sum", attribute);
      const countInfo = this.createAggregateDescriptor("count", attribute);
      if (!sumInfo || !countInfo)
        throw new QueryError(
          `Avg operation requires sum and count views for attribute ${attribute}`
        );
      return this.createAggregateQuery({
        kind: "avg",
        attribute,
        sumDescriptor: sumInfo.descriptor,
        countDescriptor: countInfo.descriptor,
      });
    }

    if (typeof this.countDistinctSelector !== "undefined") {
      const attribute =
        this.countDistinctSelector == null
          ? undefined
          : String(this.countDistinctSelector);
      const info = this.createAggregateDescriptor("distinct", attribute);
      if (info) {
        info.countDistinct = true;
        return this.createAggregateQuery(info);
      }
    }

    const aggregatorUsed =
      typeof this.countSelector !== "undefined" ||
      typeof this.countDistinctSelector !== "undefined" ||
      !!this.minSelector ||
      !!this.maxSelector ||
      !!this.sumSelector ||
      !!this.distinctSelector;

    const aggregatorChecks: Array<[ViewKind, SelectSelector<M> | undefined]> = [
      [
        "count",
        (this.countSelector ?? undefined) as SelectSelector<M> | undefined,
      ],
      ["max", this.maxSelector],
      ["min", this.minSelector],
      ["sum", this.sumSelector],
      ["distinct", this.distinctSelector],
    ];

    for (const [kind, selector] of aggregatorChecks) {
      const attribute = selector ? String(selector) : undefined;
      const info = this.createAggregateDescriptor(kind, attribute);
      if (info) return this.createAggregateQuery(info);
    }

    if (aggregatorUsed) {
      throw new QueryError(
        `No CouchDB view metadata found for table ${Model.tableName(
          this.fromSelector
        )} aggregator`
      );
    }
    return undefined;
  }

  /**
   * @description Creates an aggregate descriptor for a view-based aggregation
   */
  private createAggregateDescriptor(
    kind: ViewKind,
    attribute?: string
  ): Extract<FabricAggregateInfo, { kind: ViewKind }> | undefined {
    if (!this.fromSelector) return undefined;
    const metas = findViewMetadata(this.fromSelector, kind, attribute);
    if (!metas.length) return undefined;
    const meta = metas[0];
    const tableName = Model.tableName(this.fromSelector);
    const viewName = generateViewName(tableName, meta.attribute, kind, meta);
    const ddoc = meta.ddoc || generateDesignDocName(tableName, viewName);
    const options: Record<string, any> = {
      reduce: meta.reduce !== undefined ? true : !meta.returnDocs,
    };
    if (kind === "distinct" || kind === "groupBy") options.group = true;
    return {
      kind,
      meta,
      descriptor: {
        ddoc,
        view: viewName,
        options,
      },
    };
  }

  /**
   * @description Creates the special aggregate MangoQuery marker
   */
  private createAggregateQuery(
    info: FabricAggregateInfo
  ): MangoQuery & { aggregate: true; aggregateInfo: FabricAggregateInfo } {
    return {
      selector: {},
      aggregate: true,
      aggregateInfo: info,
    } as MangoQuery & { aggregate: true; aggregateInfo: FabricAggregateInfo };
  }

  /**
   * @description Gets the adapter cast to FabricClientAdapter for view access
   */
  private getFabricAdapter(): FabricClientAdapter {
    return this.adapter as FabricClientAdapter;
  }

  /**
   * @description Executes an aggregate query via adapter's view method
   */
  private async executeAggregate<R>(
    info: FabricAggregateInfo,
    ctx: Context<FabricClientFlags>
  ): Promise<R> {
    if (!this.isViewAggregate(info)) {
      return this.handleAverage<R>(info, ctx);
    }
    const fabricAdapter = this.getFabricAdapter();
    const viewInfo = info as Extract<FabricAggregateInfo, { kind: ViewKind }>;
    const response = await fabricAdapter.view<ViewResponse>(
      viewInfo.descriptor.ddoc,
      viewInfo.descriptor.view,
      viewInfo.descriptor.options,
      ctx
    );
    return this.processViewResponse<R>(info, response);
  }

  /**
   * @description Handles average calculation from sum and count views
   */
  private async handleAverage<R>(
    info: FabricAggregateInfo,
    ctx: Context<FabricClientFlags>
  ): Promise<R> {
    if (info.kind !== "avg")
      throw new QueryError("Average descriptor is not valid");
    const fabricAdapter = this.getFabricAdapter();
    const [sumDesc, countDesc] = [info.sumDescriptor, info.countDescriptor];
    const [sumResponse, countResponse] = await Promise.all([
      fabricAdapter.view<ViewResponse>(
        sumDesc.ddoc,
        sumDesc.view,
        sumDesc.options,
        ctx
      ),
      fabricAdapter.view<ViewResponse>(
        countDesc.ddoc,
        countDesc.view,
        countDesc.options,
        ctx
      ),
    ]);
    const sum = sumResponse.rows?.[0]?.value ?? 0;
    const count = countResponse.rows?.[0]?.value ?? 0;
    if (!count) return 0 as unknown as R;
    return (sum / count) as unknown as R;
  }

  /**
   * @description Processes the view response based on aggregate kind
   */
  private processViewResponse<R>(
    info: FabricAggregateInfo,
    response: ViewResponse
  ): R {
    if (info.kind === "avg")
      throw new QueryError(
        "Average results should be handled before processing rows"
      );
    const rows = response.rows || [];
    const viewInfo = info as Extract<FabricAggregateInfo, { kind: ViewKind }>;
    const meta = viewInfo.meta;
    if (viewInfo.countDistinct) {
      return (rows.length || 0) as unknown as R;
    }
    if (viewInfo.kind === "distinct" || viewInfo.kind === "groupBy") {
      return rows.map((row) => row.key ?? row.value) as unknown as R;
    }
    if (meta.returnDocs) {
      return rows.map((row) => row.value ?? row.doc ?? row) as unknown as R;
    }
    if (!rows.length) {
      return (viewInfo.kind === "count" ? 0 : null) as unknown as R;
    }
    return (rows[0].value ?? rows[0].key ?? null) as unknown as R;
  }

  /**
   * @description Type guard to check if info is a view-based aggregate
   */
  private isViewAggregate(
    info: FabricAggregateInfo
  ): info is Extract<FabricAggregateInfo, { kind: ViewKind }> {
    return info.kind !== "avg";
  }
}
