import {
  MaybeContextualArg,
  OrderDirection,
  Paginator,
  PreparedStatement,
  QueryClause,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricQuery } from "./types";
import { Constructor } from "@decaf-ts/decoration";
import { toCamelCase, toPascalCase } from "@decaf-ts/logging";
import { FabricClientAdapter } from "./FabricClientAdapter";

export class FabricClientPaginator<M extends Model> extends Paginator<
  M,
  M,
  FabricQuery
> {
  constructor(
    adapter: FabricClientAdapter,
    query: FabricQuery | PreparedStatement<any>,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepare(rawStatement: FabricQuery): FabricQuery {
    throw new UnsupportedError(
      `Raw query access must be implemented by a subclass. only prepared statements are natively available`
    );
  }

  override page(
    page: number = 1,
    ...args: MaybeContextualArg<any>
  ): Promise<M[]> {
    return super.page(page, ...args); // this will fail for non-prepared statements
  }
}
