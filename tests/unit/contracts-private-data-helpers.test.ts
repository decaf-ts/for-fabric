import "reflect-metadata";

import { Model, model } from "@decaf-ts/decorator-validation";
import { privateData } from "../../src/shared/decorators";
import {
  hasPrivateData,
  isModelPrivate,
  processModel,
} from "../../src/contracts/private-data";
import { prop } from "@decaf-ts/decoration";

@model()
class PrivateDataModel extends Model {
  @prop()
  public id?: string;

  @privateData("Org1")
  @prop()
  public secret?: string;

  @prop()
  public regular?: string;

  constructor(data?: Partial<PrivateDataModel>) {
    super(data);
  }
}

describe.skip("contracts/private-data helpers", () => {
  it("detects private metadata on model", () => {
    const model = new PrivateDataModel({
      id: "m1",
      secret: "top-secret",
      regular: "value",
    });

    expect(hasPrivateData(model)).toBe(true);
    expect(isModelPrivate(model)).toBe(false);
  });

  it.skip("processModel splits regular and private properties", () => {
    const model = new PrivateDataModel({
      id: "m1",
      secret: "top-secret",
      regular: "value",
    });

    const adapter = {
      isReserved: jest.fn().mockReturnValue(false),
    };

    const result = processModel(adapter, model);

    expect(result.model).toBeDefined();
    expect(result.result).toEqual({ id: "m1", regular: "value" });
    expect(result.privateData).toEqual({
      Org1: expect.objectContaining({ secret: "top-secret" }),
    });
  });
});
