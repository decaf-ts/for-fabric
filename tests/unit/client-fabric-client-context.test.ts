import "reflect-metadata";

import { FabricClientContext } from "../../src/client/FabricClientContext";

describe("FabricClientContext", () => {
  it("whitelists only client override flags", () => {
    const ctx = new FabricClientContext();
    ctx.accumulate({
      allowGatewayOverride: true,
      allowManualEndorsingOrgs: true,
      legacy: true,
      rebuildWithTransient: true,
      encryptTransient: "secret",
      syntheticEvents: false,
      endorsingOrgs: ["Org1MSP"],
      mspEventOnly: true,
      operation: "create",
      childContexts: [{}],
      logger: { info: jest.fn() },
    } as any);

    expect(ctx.toOverrides()).toEqual({
      allowGatewayOverride: true,
      allowManualEndorsingOrgs: true,
      legacy: true,
      rebuildWithTransient: true,
      encryptTransient: "secret",
      syntheticEvents: false,
      endorsingOrgs: ["Org1MSP"],
      mspEventOnly: true,
    });
  });
});
