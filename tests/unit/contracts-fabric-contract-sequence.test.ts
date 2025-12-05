import "reflect-metadata";

import { Repository, Sequence, SequenceOptions } from "@decaf-ts/core";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { CustomizableSequence } from "../../src/contracts/PrivateSequence";
import { FabricContractContext } from "../../src/contracts/ContractContext";

describe("FabricContractSequence", () => {
  const context = new FabricContractContext();
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  };
  context.accumulate({ logger } as any);
  let repoStub: any;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let forModelSpy: jest.SpyInstance;

  beforeEach(() => {
    repoStub = {
      read: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      pk: "id",
    };
    forModelSpy = jest
      .spyOn(Repository, "forModel")
      .mockReturnValue(repoStub as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createSequence = () =>
    new Sequence(
      {
        name: "test-seq",
        type: "Number",
        incrementBy: 1,
        startWith: 1,
      } as SequenceOptions,
      {
        alias: "default",
        context: jest.fn().mockImplementation(() => {
          throw new InternalError("Context is required");
        }),
      } as any
    );

  it("throws when context missing", async () => {
    const seq = createSequence();
    await expect(seq.current()).rejects.toThrow("Context is required");
    await expect(seq.next()).rejects.toThrow("Context is required");
  });

  it("current returns persisted value", async () => {
    const seq = createSequence();
    repoStub.read.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 5 })
    );

    await expect(seq.current(context)).resolves.toBe(5);
    expect(repoStub.read).toHaveBeenCalledWith("test-seq", context);
  });

  it("current falls back to startWith when missing", async () => {
    const seq = createSequence();
    repoStub.read.mockRejectedValue(new NotFoundError("missing"));

    await expect(seq.current(context)).resolves.toBe(1);
  });

  it("next increments existing sequence via update", async () => {
    const seq = createSequence();
    repoStub.read.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 1 })
    );
    repoStub.update.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 2 })
    );

    await expect(seq.next(context)).resolves.toBe(2);
    expect(repoStub.update).toHaveBeenCalled();
  });

  it("next creates sequence when update fails with NotFound", async () => {
    const seq = createSequence();
    repoStub.read.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 1 })
    );
    repoStub.update.mockRejectedValue(new NotFoundError("missing"));
    repoStub.create.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 3 })
    );

    await expect(seq.next(context)).resolves.toBe(3);
    expect(repoStub.create).toHaveBeenCalled();
  });

  it("range returns arithmetic progression respecting incrementBy", async () => {
    const seq = createSequence();
    repoStub.read.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 1 })
    );
    repoStub.update.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 4 })
    );

    await expect(seq.range(3, context)).resolves.toEqual([2, 3, 4]);
  });

  it("range throws when incrementBy divisor mismatched", async () => {
    const seq = createSequence();
    repoStub.read.mockResolvedValue(
      new CustomizableSequence({ id: "test-seq", current: 1 })
    );
    repoStub.update.mockRejectedValue(new InternalError("Value to increment"));

    await expect(seq.range(1, context)).rejects.toThrow();
  });
});
