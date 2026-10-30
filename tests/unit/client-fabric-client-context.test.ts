import "reflect-metadata";

import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientContext } from "../../src/client/FabricClientContext";

describe("FabricClientContext", () => {
  it("whitelists only client override flags", () => {
    const ctx = new FabricClientContext();
    ctx.accumulate({
      allowGenerationOverride: true,
      allowMirroring: false,
      evaluateTimeout: 30,
      endorseTimeout: 60,
      submitTimeout: 60,
      commitTimeout: 60,
      allowContextTransientMap: true,
      operation: "create",
      childContexts: [{}],
      logger: { info: jest.fn() },
    } as any);

    expect(ctx.toOverrides()).toEqual({
      allowGenerationOverride: true,
      allowMirroring: false,
      evaluateTimeout: 30,
      endorseTimeout: 60,
      submitTimeout: 60,
      commitTimeout: 60,
    });
  });

  it("preserves timeout overrides over adapter configuration in derived contexts", async () => {
    const adapter = new FabricClientAdapter(
      {
        evaluateTimeout: 5,
        endorseTimeout: 15,
        submitTimeout: 5,
        commitTimeout: 60,
      } as any,
      "timeout-context-test"
    );
    const parent = new FabricClientContext().accumulate({
      evaluateTimeout: 30,
      endorseTimeout: 90,
      submitTimeout: 90,
      commitTimeout: 120,
    } as any);

    const derived = await adapter.context("read", {}, undefined as any, parent);

    expect(derived.get("evaluateTimeout")).toBe(30);
    expect(derived.get("endorseTimeout")).toBe(90);
    expect(derived.get("submitTimeout")).toBe(90);
    expect(derived.get("commitTimeout")).toBe(120);
  });

  it("preserves timeout overrides over adapter configuration in derived contexts via override", async () => {
    const adapter = new FabricClientAdapter(
      {
        evaluateTimeout: 5,
        endorseTimeout: 15,
        submitTimeout: 5,
        commitTimeout: 60,
      } as any,
      "timeout-context-2"
    );
    const parent = new FabricClientContext().override({
      evaluateTimeout: 30,
      endorseTimeout: 90,
      submitTimeout: 90,
      commitTimeout: 120,
    } as any);

    const derived = await adapter.context("read", {}, undefined as any, parent);

    expect(derived.get("evaluateTimeout")).toBe(30);
    expect(derived.get("endorseTimeout")).toBe(90);
    expect(derived.get("submitTimeout")).toBe(90);
    expect(derived.get("commitTimeout")).toBe(120);
  });
});
