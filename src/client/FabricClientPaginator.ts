import {
  MaybeContextualArg,
  Paginator,
  PreparedStatement,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { FabricClientAdapter } from "./FabricClientAdapter";
import { MangoQuery } from "@decaf-ts/for-couchdb";

export class FabricClientPaginator<M extends Model> extends Paginator<
  M,
  M,
  MangoQuery
> {
  bookmark?: string;

  constructor(
    adapter: FabricClientAdapter,
    query: MangoQuery | PreparedStatement<any>,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepare(rawStatement: MangoQuery): MangoQuery {
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
