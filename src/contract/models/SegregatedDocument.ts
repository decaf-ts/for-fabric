import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  FabricFlavour,
  ownedBy,
  privateData,
  sharedData,
} from "../../shared/index";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";

const PRIVATE_COLLECTION_A = "segregatedPrivateCollectionA";
const PRIVATE_COLLECTION_B = "segregatedPrivateCollectionB";
const SHARED_COLLECTION_A = "segregatedSharedCollectionA";
const SHARED_COLLECTION_B = "segregatedSharedCollectionB";

@uses(FabricFlavour)
@table("segregated_private_document")
@model()
export class SegregatedPrivateDocument extends BaseIdentifiedModel {
  @pk()
  id!: string;

  @column()
  @required()
  title!: string;

  @column()
  @privateData(PRIVATE_COLLECTION_A)
  privateNoteA?: string;

  @column()
  @privateData(PRIVATE_COLLECTION_B)
  privateNoteB?: string;

  @column()
  @ownedBy()
  owner?: string;

  constructor(args?: ModelArg<SegregatedPrivateDocument>) {
    super(args);
  }
}

@uses(FabricFlavour)
@table("segregated_shared_document")
@model()
export class SegregatedSharedDocument extends BaseIdentifiedModel {
  @pk()
  id!: string;

  @column()
  @required()
  name!: string;

  @column()
  @sharedData(SHARED_COLLECTION_A)
  sharedNoteA?: string;

  @column()
  @sharedData(SHARED_COLLECTION_B)
  sharedNoteB?: string;

  @column()
  @ownedBy()
  owner?: string;

  constructor(args?: ModelArg<SegregatedSharedDocument>) {
    super(args);
  }
}
