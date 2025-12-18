import {
  model,
  Model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import {
  column,
  createdAt,
  pk,
  table,
  createdBy,
  updatedAt,
  updatedBy,
} from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour, ownedBy } from "../shared/index";

@uses(FabricFlavour)
@table()
@model()
export class Address extends Model {
  @pk({ type: Number, generated: true })
  id!: number;

  @column()
  @required()
  city!: string;

  @column()
  @required()
  street!: string;

  @column()
  @required()
  number!: number;

  @column()
  @createdAt()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;

  @column()
  @createdBy()
  createdBy!: string;

  @column()
  @updatedBy()
  updatedBy!: string;

  @column()
  @ownedBy()
  msp!: string;

  constructor(arg?: ModelArg<Address>) {
    super(arg);
  }
}
