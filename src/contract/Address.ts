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
  index,
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
  @index(["asc", "desc"])
  city!: string;

  @column()
  @required()
  street!: string;

  @column()
  @required()
  number!: number;

  @column()
  @createdAt()
  @index()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;

  @column()
  @createdBy()
  @index(["asc", "desc"])
  createdBy!: string;

  @column()
  @updatedBy()
  updatedBy!: string;

  @column()
  @ownedBy()
  @index()
  msp!: string;

  constructor(arg?: ModelArg<Address>) {
    super(arg);
  }
}
