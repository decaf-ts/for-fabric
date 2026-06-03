import "reflect-metadata";

import { Context } from "@decaf-ts/core";
import { Model, model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import {
  chaincode,
  channel,
  contract,
  DefaultContractResolver,
} from "../../src/shared/decorators";
import type { PeerConfig } from "../../src/shared/types";

@model()
@chaincode("custom-chaincode")
@channel("custom-channel")
@contract("custom-contract")
class StaticContractModel extends Model {
  constructor() {
    super();
  }
}

@model()
class DefaultContractModel extends Model {
  constructor() {
    super();
  }
}

@model()
@chaincode("decorated-chaincode")
@channel("decorated-channel")
@contract("decorated-contract")
class DecoratedContractModel extends Model {
  constructor() {
    super();
  }
}

const createConfig = (): PeerConfig =>
  ({
    channel: "fallback-channel",
    chaincodeName: "fallback-chaincode",
    contractName: "fallback-contract",
  }) as PeerConfig;

describe("shared/decorators contract resolution", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns static string decorators as-is", () => {
    expect(Model.chaincodeOf(StaticContractModel)).toBe("custom-chaincode");
    expect(Model.channelOf(StaticContractModel)).toBe("custom-channel");
    expect(Model.contractOf(StaticContractModel)).toBe("custom-contract");
  });

  it("passes the context to functional resolvers", async () => {
    const ctx = new Context();
    const resolver = jest.fn(
      (model: any, suffix: string, inputCtx: Context) => {
        return `${model.name}:${suffix}:${inputCtx === ctx ? "ctx" : "missing"}`;
      }
    );

    @model()
    @contract(resolver)
    class DynamicContractModel extends Model {}

    await expect(
      Model.contractOf(DynamicContractModel, "suffix", ctx as any)
    ).resolves.toBe("DynamicContractModel:suffix:ctx");
    expect(resolver).toHaveBeenCalledWith(DynamicContractModel, "suffix", ctx);
  });

  it("uses the default contract resolver naming convention", () => {
    expect(DefaultContractResolver(DefaultContractModel as any)).toBe(
      "DefaultContractModelContract"
    );
  });

  it("resolves decorated model contract data through FabricClientAdapter", async () => {
    const gateway = {
      getNetwork: jest.fn(),
    } as any;
    const network = {
      getContract: jest.fn().mockReturnValue({}),
    } as any;
    const ctx = new Context();
    const config = createConfig();

    jest.spyOn(FabricClientAdapter, "getNetwork").mockReturnValue(network);

    await FabricClientAdapter.getContract(
      gateway,
      config,
      DecoratedContractModel,
      ctx as any
    );

    expect(FabricClientAdapter.getNetwork).toHaveBeenCalledWith(
      gateway,
      "decorated-channel"
    );
    expect(network.getContract).toHaveBeenCalledWith(
      "decorated-chaincode",
      "decorated-contract"
    );
  });

  it("falls back to adapter config for undecorated models", async () => {
    const gateway = {
      getNetwork: jest.fn(),
    } as any;
    const network = {
      getContract: jest.fn().mockReturnValue({}),
    } as any;
    const ctx = new Context();
    const config = createConfig();

    jest.spyOn(FabricClientAdapter, "getNetwork").mockReturnValue(network);

    await FabricClientAdapter.getContract(
      gateway,
      config,
      DefaultContractModel,
      ctx as any
    );

    expect(FabricClientAdapter.getNetwork).toHaveBeenCalledWith(
      gateway,
      config.channel
    );
    expect(network.getContract).toHaveBeenCalledWith(
      config.chaincodeName,
      "DefaultContractModelContract"
    );
  });

  it("uses a supplied contract name string directly", async () => {
    const gateway = {
      getNetwork: jest.fn(),
    } as any;
    const network = {
      getContract: jest.fn().mockReturnValue({}),
    } as any;
    const config = createConfig();

    jest.spyOn(FabricClientAdapter, "getNetwork").mockReturnValue(network);

    await FabricClientAdapter.getContract(gateway, config, "manual-contract");

    expect(FabricClientAdapter.getNetwork).toHaveBeenCalledWith(
      gateway,
      config.channel
    );
    expect(network.getContract).toHaveBeenCalledWith(
      config.chaincodeName,
      "manual-contract"
    );
  });
});
