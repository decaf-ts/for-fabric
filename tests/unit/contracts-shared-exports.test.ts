import "reflect-metadata";

import * as sharedModelIndex from "../../src/shared/model";
import { Identity } from "../../src/shared/model/Identity";
import { IdentityCredentials } from "../../src/shared/model/IdentityCredentials";
import { IdentityType } from "../../src/shared/constants";
import { Checkable } from "../../src/shared/interfaces/Checkable";
import { ERC20Events } from "../../src/shared/erc20/erc20-constants";
import * as contractsIndex from "../../src/contracts";
import { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import { FabricContractFlags } from "../../src/contracts/types";

describe("shared model exports", () => {
  it("re-exports Identity from index", () => {
    expect(sharedModelIndex.Identity).toBe(Identity);
  });

  it("instantiates identity and credentials with defaults", () => {
    const credentials = new IdentityCredentials({
      id: "cred",
      certificate: "cert",
      rootCertificate: "root",
      privateKey: "key",
    });

    const identity = new Identity({
      id: "user",
      mspId: "Org1MSP",
      credentials,
    });

    expect(identity.type).toBe(IdentityType.X509);
    expect(identity.credentials).toEqual(
      expect.objectContaining({
        id: "cred",
        certificate: "cert",
        rootCertificate: "root",
        privateKey: "key",
      })
    );
  });
});

describe("shared interfaces and constants", () => {
  it("allows implementing Checkable interface", async () => {
    class HealthService implements Checkable {
      async healthcheck(): Promise<string> {
        return "ok";
      }
    }

    const service = new HealthService();
    await expect(service.healthcheck({} as any)).resolves.toBe("ok");
  });

  it("exposes ERC20Events values", () => {
    expect(ERC20Events.TRANSFER.trim()).toBe("Transfer");
    expect(ERC20Events.APPROVAL).toBe("Approval");
  });
});

describe("contracts index exports", () => {
  it("exposes FabricContractRepository via index", () => {
    expect(contractsIndex.FabricContractRepository).toBe(FabricContractRepository);
  });

  it("describes expected FabricContractFlags shape", () => {
    const flags: FabricContractFlags = {
      stub: {} as any,
      clientIdentity: {} as any,
      logger: { info: jest.fn() } as any,
    };

    expect(flags.stub).toBeDefined();
    expect(typeof flags.logger.info).toBe("function");
  });
});
