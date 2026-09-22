import "../../src/shared/overrides";
import {
  Condition,
  MethodQueryBuilder,
  Operator,
  column,
  pk,
  table,
} from "@decaf-ts/core";
import { model, Model, ModelArg } from "@decaf-ts/decorator-validation";
import { FabricStatement } from "../../src/contracts/FabricContractStatement";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";

@table("exists_fabric_model")
@model()
class ExistsFabricModel extends Model<boolean> {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  constructor(arg?: ModelArg<ExistsFabricModel>) {
    super(arg);
  }
}

describe("FabricStatement EXISTS translation", () => {
  it("builds the field-level EXISTS condition shape", () => {
    const condition = Condition.attribute<ExistsFabricModel>("name").exists();

    expect(condition.operator).toBe(Operator.EXISTS);
    expect((condition as any).attr1).toBe("name");
    expect((condition as any).comparison).toBe(true);
  });

  it("maps a field-level EXISTS condition to a $exists selector", () => {
    const statement = new FabricStatement({} as any, {} as any);
    (statement as any).fromSelector = ExistsFabricModel;

    const query = (statement as any).parseCondition(
      Condition.attribute<ExistsFabricModel>("name").exists()
    );

    expect(query.selector).toEqual({ name: { $exists: true } });
  });

  it("builds the exists action from the existsBy naming convention", () => {
    const result = MethodQueryBuilder.build("existsByName");

    expect(result.action).toBe("exists");
    expect(result.where).toEqual(Condition.attribute("name").exists());
  });

  it("combines existsBy fields with AND", () => {
    const result = MethodQueryBuilder.build("existsByNameAndAge");

    expect(result.action).toBe("exists");
    expect(result.where).toEqual(
      Condition.attribute("name")
        .exists()
        .and(Condition.attribute("age").exists())
    );
  });
});
