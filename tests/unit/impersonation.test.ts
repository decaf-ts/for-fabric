import { Repo, Repository } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { Product } from "../../src/contract/models/Product";
import { generateGtin } from "../../src/contract/models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Logging, LogLevel } from "@decaf-ts/logging";
import { CAConfig, PeerConfig } from "../../src/shared/index";
import { FabricClientAdapter } from "../../src/client/index";
import { E2eConfig } from "../e2e/e2e.config";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

jest.setTimeout(50000);

describe("e2e Repository test", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Product>;

  const contractName = "GlobalContract";

  const caConfig: CAConfig = {
    url: "https://localhost:7011",
    tls: {
      trustedRoots: ["./docker/docker-data/tls-ca-cert.pem"],
      verify: true,
    },
    caName: "org-a",
    caCert: "./docker/docker-data/admin/msp/signcerts",
    caKey: "./docker/docker-data/admin/msp/keystore",
  };

  const peerConfig: PeerConfig = {
    cryptoPath: "./docker/infrastructure/crypto-config",
    keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
    certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
    tlsCert: "./docker/docker-data/tls-ca-cert.pem",
    peerEndpoint: "localhost:7031",
    peerHostAlias: "localhost",
    chaincodeName: contractName,
    ca: "org-a",
    mspId: "Peer0OrgaMSP",
    channel: "simple-channel",
  };

  beforeAll(async () => {
    adapter = await adapterFactory(peerConfig);
    repo = Repository.forModel(Clazz);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  describe("Basic Crud", () => {
    it("creates", async () => {
      const id = generateGtin();
      const model = new Product({
        productCode: id,
        inventedName: "test_name",
        nameMedicinalProduct: "123456789",
        strengths: [
          {
            productCode: id,
            strength: "200mg",
            substance: "Ibuprofen",
          },
          {
            productCode: id,
            strength: "400mg",
            substance: "Ibuprofen",
          },
        ],
        markets: [
          {
            productCode: id,
            marketId: "BR",
            nationalCode: "BR",
            mahName: "ProPharma BR",
          },
          {
            productCode: id,
            marketId: "US",
            nationalCode: "US",
            mahName: "ProPharma US",
          },
        ],
      });

      const transactionMock = jest
        .spyOn(FabricClientAdapter, "getConnection")
        .mockImplementation(() => {
          throw new InternalError("for test");
        });

      const getClientMock = jest
        .spyOn(FabricClientAdapter, "getClient")
        .mockImplementation((...args: any[]) => {
          return {};
        });

      const override: any = {
        keyCertOrDirectoryPath: "dummy",
        certCertOrDirectoryPath: "dummy",
      };

      await expect(
        repo.override(override as any).create(model)
      ).rejects.toThrow(InternalError);

      expect(transactionMock).toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ...override,
        })
      );
    });
  });
});
