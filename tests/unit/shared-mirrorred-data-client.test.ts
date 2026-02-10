import { FabricClientAdapter } from "../../src/client";

import { Context, Repo, Repository } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { Logging, LogLevel } from "@decaf-ts/logging";
import { CAConfig, PeerConfig, privateData } from "../../src/shared";
import { E2eConfig } from "../e2e/e2e.config";
import { pk, column, table, createdAt } from "@decaf-ts/core";
import {
  Model,
  ModelArg,
  required,
  model,
} from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../src/index";
import { FabricClientFlags } from "../../src/client/types";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory } = E2eConfig;

jest.setTimeout(50000);

describe("shared and mirrored data - client", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;

  const contractName = "GlobalContract";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  });

  describe("private collections", () => {
    @privateData("PrivatE")
    @uses(FabricFlavour)
    @table("private_class")
    @model()
    class PrivateClass extends Model {
      @pk()
      id!: number;

      @column()
      @required()
      name!: string;

      @createdAt()
      createdAt!: Date;

      constructor(arg?: ModelArg<PrivateClass>) {
        super(arg);
      }
    }

    let repo: Repo<PrivateClass>;

    beforeAll(() => {
      repo = Repository.forModel(PrivateClass);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
      jest.resetAllMocks();
    });

    it("identifies the collection", async () => {
      const collections = Model.collectionsFor(PrivateClass);
      const { privateCols, sharedCols } = collections;
      expect(privateCols.length).toEqual(1);
      expect(sharedCols.length).toEqual(0);
      expect(privateCols[0]).toEqual("PrivatE");
    });

    it("segregates the model", async () => {
      const instance = new PrivateClass({
        id: "id",
        name: "name",
      });
      const { model, transient, privates, shared } = instance.segregate();

      expect(Object.keys(instance).every((k) => model[k] === "undefined"));
      expect(model).not.toEqual(instance);
      expect(transient).toEqual(
        expect.objectContaining({
          id: "id",
          name: "name",
          createdAt: undefined,
        })
      );
      expect(privates).toEqual(
        expect.objectContaining({
          id: "id",
          name: "name",
          createdAt: undefined,
        })
      );
      expect(shared).toEqual({});
    });

    it("creates from client side", async () => {
      const model = new PrivateClass({
        name: "name",
      });

      jest
        .spyOn(FabricClientAdapter, "getConnection")
        .mockImplementation(() => {
          throw new InternalError("for test");
        });

      jest
        .spyOn(FabricClientAdapter, "getClient")
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .mockImplementation((cfg: PeerConfig): any => {
          return {};
        });

      const transactionMock = jest
        .spyOn(adapter, "transaction" as any)
        .mockImplementation(
          (
            ctx: Context<FabricClientFlags>,

            api: string,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            submit = true,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            args?: any[],
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            transientData?: Record<string, string>,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            endorsingOrganizations?: Array<string>,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            className?: string
          ): any => {
            return Buffer.from(new PrivateClass().serialize());
          }
        );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const created = await repo.create(model);
      expect(transactionMock).toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalledWith(
        expect.any(Context),
        "create",
        true,
        [new PrivateClass().serialize()],
        {
          private_class: { name: "name", id: undefined, createdAt: undefined },
        },
        undefined,
        PrivateClass.name
      );
    });
  });
});
