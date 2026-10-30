import "reflect-metadata";

import { pk } from "@decaf-ts/core";
import { Model, model } from "@decaf-ts/decorator-validation";
import { connect } from "@hyperledger/fabric-gateway";
import { getIdentity, getSigner } from "../../src/client/fabric-fs";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import type { PeerConfig } from "../../src/shared/types";

jest.mock("@hyperledger/fabric-gateway", () => ({
  ...jest.requireActual("@hyperledger/fabric-gateway"),
  connect: jest.fn(),
}));

jest.mock("../../src/client/fabric-fs", () => ({
  ...jest.requireActual("../../src/client/fabric-fs"),
  getIdentity: jest.fn(),
  getSigner: jest.fn(),
}));

@model()
class TimeoutWallet extends Model {
  @pk()
  id!: string;
}

const initialTimeouts = {
  evaluateTimeout: 7,
  endorseTimeout: 17,
  submitTimeout: 9,
  commitTimeout: 61,
};

const repositoryOverrides = {
  evaluateTimeout: 31,
  endorseTimeout: 41,
  submitTimeout: 51,
  commitTimeout: 71,
};

const config: PeerConfig = {
  cryptoPath: "/tmp",
  keyCertOrDirectoryPath: "key",
  certCertOrDirectoryPath: "cert",
  tlsCert: "tls-cert",
  peerEndpoint: "localhost:7051",
  peerHostAlias: "peer0.org1.example.com",
  chaincodeName: "timeout-test",
  mspId: "Org1MSP",
  channel: "mychannel",
  ...initialTimeouts,
};

describe("Fabric client transaction timeouts", () => {
  const connectMock = jest.mocked(connect);
  const getIdentityMock = jest.mocked(getIdentity);
  const getSignerMock = jest.mocked(getSigner);

  let connectOptions: any;
  let submittedDeadlines: Record<string, number>;
  let adapter: FabricClientAdapter;
  let repo: FabricClientRepository<TimeoutWallet>;

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(10_000);
    submittedDeadlines = {};
    connectOptions = undefined;

    adapter = new FabricClientAdapter(
      config,
      `timeout-test-${Math.random().toString(36).slice(2)}`
    );
    const result = Buffer.from(
      (adapter as any).serializer.serialize(new TimeoutWallet({ id: "wallet-1" }))
    );
    const contract = {
      getContractName: jest.fn(() => "timeout-test"),
      submit: jest.fn(async () => {
        submittedDeadlines = {
          evaluate: connectOptions.evaluateOptions().deadline,
          endorse: connectOptions.endorseOptions().deadline,
          submit: connectOptions.submitOptions().deadline,
          commit: connectOptions.commitStatusOptions().deadline,
        };
        return result;
      }),
      evaluate: jest.fn(async () => result),
    };
    const gateway = {
      close: jest.fn(),
      getNetwork: jest.fn(() => ({
        getContract: jest.fn(() => contract),
      })),
    };

    connectMock.mockImplementation((options: any) => {
      connectOptions = options;
      return gateway as any;
    });
    getIdentityMock.mockResolvedValue({
      credentials: Buffer.from("certificate"),
    } as any);
    getSignerMock.mockResolvedValue({} as any);

    jest.spyOn(adapter, "getClient").mockReturnValue({} as any);
    repo = new FabricClientRepository(adapter, TimeoutWallet);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    connectMock.mockReset();
    getIdentityMock.mockReset();
    getSignerMock.mockReset();
  });

  const expectedDeadlines = (timeouts: typeof initialTimeouts) => ({
    evaluate: 10_000 + timeouts.evaluateTimeout * 1_000,
    endorse: 10_000 + timeouts.endorseTimeout * 1_000,
    submit: 10_000 + timeouts.submitTimeout * 1_000,
    commit: 10_000 + timeouts.commitTimeout * 1_000,
  });

  it("uses timeout values from the adapter config when the repository submits", async () => {
    await repo.create(new TimeoutWallet({ id: "wallet-1" }));

    expect(submittedDeadlines).toEqual(expectedDeadlines(initialTimeouts));
  });

  it("uses repository .override timeout values when the repository submits", async () => {
    const overriddenRepo = repo.override(repositoryOverrides);

    await overriddenRepo.create(new TimeoutWallet({ id: "wallet-1" }));

    expect(submittedDeadlines).toEqual(expectedDeadlines(repositoryOverrides));
  });
});
