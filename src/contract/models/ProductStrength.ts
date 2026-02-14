import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  column,
  ContextualArgs,
  index,
  OrderDirection,
  pk,
  table,
  uuid,
} from "@decaf-ts/core";
import { TableNames } from "./constants";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";

import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  sharedData,
} from "../../shared/index";
import { composed, InternalError } from "@decaf-ts/db-decorators";
import { gtin } from "./gtin";

function strengthSeed(m: ProductStrength) {
  try {
    return `${m.productCode}${m.strength}${m.substance ? m.substance : ""}`;
  } catch (e: unknown) {
    throw new InternalError(`Failed to generate deterministic uuid: ${e}`);
  }
}

@sharedData(NamespaceCollection("decaf-namespace"))
@uses(FabricFlavour)
@table(TableNames.ProductStrength)
@model()
@description("Represents the product’s strength and composition details.")
export class ProductStrength extends BaseIdentifiedModel {
  @pk()
  // @mirror("mirror-collection", "org-a")
  @composed(["productCode", "uuid"], ":")
  @description("Unique identifier of the product strength.")
  id!: string;

  @uuid(strengthSeed)
  @required()
  @description("Unique identifier of the audit record.")
  uuid!: string;

  // @manyToOne(
  //   () => Product,
  //   { update: Cascade.NONE, delete: Cascade.NONE },
  //   false
  // )
  @gtin()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product code associated with this strength entry.")
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product concentration or dosage (e.g., 500mg, 10%).")
  strength!: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Active substance related to this product strength.")
  substance?: string;

  @column()
  @description("Legal entity name responsible for the product.")
  legalEntityName?: string;

  constructor(model?: ModelArg<ProductStrength>) {
    super(model);
  }
}
