import "reflect-metadata";

import "../../src/shared/overrides";

import { Context } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { PeerConfig } from "../../src/shared/types";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";

const peerConfig: PeerConfig = {
  cryptoPath: "/tmp",
  keyCertOrDirectoryPath: "/tmp/keystore",
  certCertOrDirectoryPath: "/tmp/signcerts",
  tlsCert: "tls-cert",
  peerEndpoint: "localhost:7051",
  peerHostAlias: "peer0.org1.example.com",
  chaincodeName: "shared-contract",
  mspId: "Org1MSP",
  channel: "mychannel",
  evaluateTimeout: 120_000,
  endorseTimeout: 120_000,
  submitTimeout: 120_000,
  commitTimeout: 120_000,
};

const encodeResult = (payload: any) =>
  new TextEncoder().encode(JSON.stringify(payload));

const tableName = Model.tableName(OtherProductShared);

function buildSharedModel(overrides: Partial<OtherProductShared> = {}) {
  const productCode =
    overrides.productCode ?? `shared-${Math.random().toString(36).slice(2)}`;
  return new OtherProductShared({
    productCode,
    inventedName: overrides.inventedName ?? "shared-name",
    nameMedicinalProduct: overrides.nameMedicinalProduct ?? "medicinal",
    productRecall: overrides.productRecall ?? false,
    markets: overrides.markets ?? [
      new OtherMarket({
        productCode,
        marketId: "market-a",
      }),
    ],
    strengths: overrides.strengths ?? [
      new OtherProductStrength({
        productCode,
        strength: "10mg",
      }),
    ],
    ...overrides,
  });
}

function segregateModel(model: OtherProductShared) {
  const seg = Model.segregate(model);
  return {
    publicModel: seg.model,
    transient: seg.transient || {},
  };
}

function buildReadPayload(model: OtherProductShared) {
  return {
    productCode: model.productCode,
    inventedName: model.inventedName,
    nameMedicinalProduct: model.nameMedicinalProduct,
    productRecall: model.productRecall,
    markets: (model.markets || []).map((market) => ({
      ...market,
    })),
    strengths: (model.strengths || []).map((strength) => ({
      ...strength,
    })),
  };
}

describe.skip("FabricClientAdapter private/shared flow", () => {
  let adapter: FabricClientAdapter;

  beforeAll(() => {
    adapter = new FabricClientAdapter(peerConfig);
  });

  beforeEach(() => {
    jest.spyOn(adapter, "Contract" as any).mockImplementation(() => {
      return {
        async submit(api: string, options: any) {},
        async evaluate(api: string, options: any) {},
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refreshes the full model after create when transient data exists", async () => {
    const baseModel = buildSharedModel();
    const { publicModel, transient } = segregateModel(baseModel);
    expect(Object.keys(transient).length).toBeGreaterThan(0);

    const ctx = await adapter.context(
      OperationKeys.CREATE,
      {},
      OtherProductShared
    );
    const readResult = buildReadPayload(baseModel);
    const readSpy = jest
      .spyOn(adapter, "read")
      .mockResolvedValue(readResult as Record<string, any>);
    const serializer = (adapter as any).serializer;
    const serializedModel = Model.build(publicModel, OtherProductShared.name);
    const serialized = serializer.serialize(
      serializedModel,
      OtherProductShared.name
    );
    const submitSpy = jest
      .spyOn(adapter as any, "submitTransaction")
      .mockImplementation(async () => {
        const payload = encodeResult(serialized);
        console.log("submit payload", new TextDecoder().decode(payload));
        return payload;
      });

    const created = await adapter.create(
      OtherProductShared,
      baseModel.productCode,
      publicModel,
      transient,
      ctx as Context<FabricClientAdapter>
    );

    expect(submitSpy).toHaveBeenCalledWith(
      ctx,
      OperationKeys.CREATE,
      expect.any(Array),
      expect.objectContaining({
        [tableName]: transient,
      }),
      undefined,
      OtherProductShared.name
    );
    expect(readSpy).toHaveBeenCalledWith(
      OtherProductShared,
      baseModel.productCode,
      ctx
    );
    expect(created).toEqual(readResult);
    expect(created.markets).toHaveLength(baseModel.markets.length);
    expect(created.strengths).toHaveLength(baseModel.strengths.length);
  });

  it("refreshes the full model after update when transient data exists", async () => {
    const baseModel = buildSharedModel();
    const updatedModel = buildSharedModel({
      productCode: baseModel.productCode,
      inventedName: "updated-name",
      nameMedicinalProduct: "updated-medicinal",
      strengths: [
        new OtherProductStrength({
          productCode: baseModel.productCode,
          strength: "20mg",
        }),
      ],
      markets: [
        new OtherMarket({
          productCode: baseModel.productCode,
          marketId: "market-b",
        }),
      ],
      productRecall: true,
    });
    const { publicModel, transient } = segregateModel(updatedModel);
    expect(Object.keys(transient).length).toBeGreaterThan(0);

    const ctx = await adapter.context(
      OperationKeys.UPDATE,
      {},
      OtherProductShared
    );
    const readResult = buildReadPayload(updatedModel);
    const readSpy = jest
      .spyOn(adapter, "read")
      .mockResolvedValue(readResult as Record<string, any>);
    const serializer = (adapter as any).serializer;
    const serialized = serializer.serialize(
      publicModel,
      OtherProductShared.name
    );
    const submitSpy = jest
      .spyOn(adapter as any, "submitTransaction")
      .mockImplementation(async () => {
        const payload = encodeResult(serialized);
        console.log("submit payload", new TextDecoder().decode(payload));
        return payload;
      });

    const updated = await adapter.update(
      OtherProductShared,
      updatedModel.productCode,
      publicModel,
      transient,
      ctx as Context<FabricClientAdapter>
    );

    expect(submitSpy).toHaveBeenCalledWith(
      ctx,
      OperationKeys.UPDATE,
      expect.any(Array),
      expect.objectContaining({
        [tableName]: transient,
      }),
      undefined,
      OtherProductShared.name
    );
    expect(readSpy).toHaveBeenCalledWith(
      OtherProductShared,
      updatedModel.productCode,
      ctx
    );
    expect(updated).toEqual(readResult);
    expect(updated.productRecall).toBe(true);
  });
});
