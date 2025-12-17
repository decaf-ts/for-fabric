import {
  AdapterFlags,
  Condition,
  Statement,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "./FabricClientAdapter";
import { MangoQuery } from "@decaf-ts/for-couchdb";

export class FabricClientStatement<M extends Model, R> extends Statement<
  M,
  FabricClientAdapter,
  R,
  MangoQuery
> {
  constructor(adapter: FabricClientAdapter, overrides?: Partial<AdapterFlags>) {
    super(adapter, overrides);
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
