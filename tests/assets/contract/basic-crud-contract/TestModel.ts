// import {
//   maxlength,
//   minlength,
//   model,
//   ModelArg,
//   required,
// } from "@decaf-ts/decorator-validation";
// import { BaseModel } from "@decaf-ts/core";
// import { column, table, unique } from "@decaf-ts/core";
// import { pk } from "@decaf-ts/core";
// import { FabricObject, FabricProperty } from "../../../../src/shared/fabric-shims";

// @table("tst_user")
// @model()
// @FabricObject()
// export class TestModel extends BaseModel {
//   @pk()
//   id!: number;

//   @column("tst_name")
//   @required()
//   @FabricProperty()
//   name!: string;

//   @column("tst_nif")
//   @unique()
//   @minlength(9)
//   @maxlength(9)
//   @required()
//   @FabricProperty()
//   nif!: string;

//   constructor(arg?: ModelArg<TestModel>) {
//     super(arg);
//   }
// }

import { Object as FabricObject, Property } from 'fabric-contract-api';

@FabricObject()
export class TestModel {
  @Property()
  public name!: string;

  @Property()
  public nif!: string;

  constructor(args?: TestModel) {
    Object.assign(this, args);
  }
}