import "reflect-metadata";

import { FabricClientContext } from "../../src/client/FabricClientContext";

describe("FabricClientContext", () => {
  it("whitelists only client override flags", () => {
    const ctx = new FabricClientContext();
    ctx.accumulate({
      allowGenerationOverride: true,
      allowMirroring: false,
      allowContextTransientMap: true,
      operation: "create",
      childContexts: [{}],
      logger: { info: jest.fn() },
    } as any);

    expect(ctx.toOverrides()).toEqual({
      allowGenerationOverride: true,
      allowMirroring: false,
    });
  });
});
