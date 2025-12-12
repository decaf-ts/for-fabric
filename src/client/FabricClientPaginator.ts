import { OrderDirection, Paginator, QueryClause } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricQuery } from "./types";
import { Constructor } from "@decaf-ts/decoration";
import { Context, OperationKeys } from "@decaf-ts/db-decorators";
import { toCamelCase, toPascalCase } from "@decaf-ts/logging";
import { FabricClientAdapter } from "./FabricClientAdapter";

export class FabricClientPaginator<M extends Model> extends Paginator<
  M,
  M,
  FabricQuery
> {
  constructor(
    adapter: FabricClientAdapter,
    query: FabricQuery,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  async page(page: number = 1, ...args: any[]): Promise<M[]> {
    const contextArgs = await Context.args<M, any>(
      OperationKeys.READ,
      this.clazz,
      args,
      this.adapter
    );

    let statement = Object.assign({}, this.statement, {
      args: [...this.statement.args],
      params: { ...this.statement.params },
    });
    if (!this.statement.method.includes("pageBy"))
      statement = this.prepare(statement) as any;
    statement.args.push(page);
    page = this.validatePage(page);

    const results: any[] = await this.adapter.raw(
      statement,
      ...contextArgs.args
    );
    this._currentPage = page;
    return results;
  }

  protected prepare(rawStatement: FabricQuery): FabricQuery {
    // only support main attr for now before implementing pageBy
    let attrs = rawStatement.method.split(
      new RegExp(
        `(${[QueryClause.FIND_BY, QueryClause.SELECT, QueryClause.ORDER_BY, QueryClause.GROUP_BY, QueryClause.AND, QueryClause.OR].join("|")})`,
        "i"
      )
    );

    attrs = attrs
      .map((s) => s.trim())
      .filter(Boolean)
      .filter(
        (s) =>
          ![
            QueryClause.FIND_BY,
            QueryClause.SELECT,
            QueryClause.ORDER_BY,
            QueryClause.GROUP_BY,
            toPascalCase(OrderDirection.ASC),
            toPascalCase(OrderDirection.DSC),
          ].find((c) => s.includes(c))
      );

    const fullOrderBy = rawStatement.method.split(QueryClause.ORDER_BY);
    let orderBy: any;
    if (fullOrderBy.length) {
      orderBy = fullOrderBy[1]
        .split(
          new RegExp(
            `${[toPascalCase(OrderDirection.ASC), toPascalCase(OrderDirection.DSC), QueryClause.GROUP_BY + ".*", QueryClause.THEN_BY].join("|")}`,
            "i"
          )
        )
        .map((s) => s.trim())
        .filter(Boolean);
      orderBy = [
        orderBy[0] as any,
        fullOrderBy[1].includes(toPascalCase(OrderDirection.ASC))
          ? OrderDirection.ASC
          : OrderDirection.DSC,
      ];
    }

    if (attrs.length === 1 && attrs[0] === orderBy[0]) {
      const attr = attrs[0];
      return Object.assign({}, rawStatement, {
        method: "pageBy",
        args: [toCamelCase(attr), orderBy[1], this.size],
      });
    } else {
      return Object.assign({}, rawStatement, {
        method: rawStatement.method.replace(QueryClause.FIND_BY, "pageBy"),
        args: [...rawStatement.args, this.size],
      });
    }
  }
}
