import "reflect-metadata";

import { Model, model } from "@decaf-ts/decorator-validation";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import {
  FabricContractAdapter,
  createdByOnFabricCreateUpdate,
  pkFabricOnCreate,
} from "../../src/contracts/ContractAdapter";
import type { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import type { FabricContractSequence } from "../../src/contracts/FabricContractSequence";
import type { SequenceOptions } from "@decaf-ts/core";
import { UnsupportedError } from "@decaf-ts/core";
import type { Logger } from "@decaf-ts/logging";
import { prop } from "@decaf-ts/decoration";
import { ClientIdentity } from "fabric-shim-api";

@model()
class TestModel extends Model {
  @prop()
  public createdBy?: string;

  @prop()
  public id?: string;

  constructor(data?: Partial<TestModel>) {
    super(data);
  }
}

const createContext = (identity?: Partial<ClientIdentity>) => {
  const context = new FabricContractContext();
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  };
  context.accumulate({
    identity,
    logger,
  } as any);
  return context;
};

describe("contracts/ContractAdapter helpers", () => {
  it("createdByOnFabricCreateUpdate assigns identity id to target property", async () => {
    const clientIdentity = { getID: jest.fn().mockReturnValue("user::1") };
    const context = createContext(clientIdentity as ClientIdentity);

    const model = new TestModel();

    await createdByOnFabricCreateUpdate.call(
      {} as FabricContractRepository<any>,
      context,
      {} as any,
      "createdBy",
      model
    );

    expect(model.createdBy).toBe("user::1");
    expect(clientIdentity.getID).toHaveBeenCalledTimes(1);
  });

  it("resultIterator parses iterator values and closes iterator", async () => {
    class TestAdapter extends FabricContractAdapter {
      public async readResults(log: Logger, iterator: any) {
        // Access protected method for testing
        return await (this as any).resultIterator(log, iterator, false);
      }
    }

    const adapter = new TestAdapter(undefined as any);
    const log = {
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: { value: Buffer.from(JSON.stringify({ foo: "bar" })) },
          done: false,
        })
        .mockResolvedValueOnce({ done: true }),
      close: jest.fn(),
    } as unknown as any;

    const results = await adapter.readResults(log, iterator);

    expect(results).toEqual([{ foo: "bar" }]);
    expect(iterator.next).toHaveBeenCalledTimes(2);
    expect(iterator.close).toHaveBeenCalledTimes(1);
  });

  it("createdByOnFabricCreateUpdate throws UnsupportedError when identity missing", async () => {
    const context = new FabricContractContext();
    const model = new TestModel();

    await expect(
      createdByOnFabricCreateUpdate.call(
        {} as FabricContractRepository<any>,
        context,
        {} as any,
        "createdBy",
        model
      )
    ).rejects.toBeInstanceOf(UnsupportedError);
  });

  it("pkFabricOnCreate requests sequence and defines immutable id", async () => {
    const context = new FabricContractContext();
    const nextValue = "42";
    const sequenceMock: Partial<FabricContractSequence> = {
      next: jest.fn().mockResolvedValue(nextValue),
    };
    const adapterMock = {
      Sequence: jest.fn().mockResolvedValue(sequenceMock),
    };
    const repositoryMock = {
      adapter: adapterMock,
    } as unknown as FabricContractRepository<TestModel>;

    const model = new TestModel();
    const sequenceOptions = { type: "Number" } as SequenceOptions;

    await pkFabricOnCreate.call(
      repositoryMock,
      context,
      sequenceOptions,
      "id",
      model
    );

    expect(adapterMock.Sequence).toHaveBeenCalledTimes(1);
    expect(adapterMock.Sequence).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String), type: "Number" })
    );
    expect(model.id).toBe(nextValue);
    const descriptor = Object.getOwnPropertyDescriptor(model, "id");
    expect(descriptor?.writable).toBe(false);
    expect(sequenceMock.next).toHaveBeenCalledWith(context);
  });
});
