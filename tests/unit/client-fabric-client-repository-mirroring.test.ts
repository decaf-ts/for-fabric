import "reflect-metadata";

import { Context, pk } from "@decaf-ts/core";
import { Model, model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { mirror } from "../../src/shared/decorators";

@model()
@mirror("mirror-collection", "Org1MSP")
class MirroredRepositoryModel extends Model {
  @pk()
  id!: string;
}

class ExposedRepository extends FabricClientRepository<MirroredRepositoryModel> {
  public applyLegacyMirrorFlag(
    ctx: Context,
    model: MirroredRepositoryModel
  ): void {
    (this as any).ensureLegacyMirrorFlag(ctx, model);
  }
}

describe("FabricClientRepository mirror gating", () => {
  it("does not mark mirrored models legacy when allowMirroring is false", () => {
    const adapter = new FabricClientAdapter(
      { allowMirroring: false } as any,
      "mirror-repo-test"
    );
    const repository = new ExposedRepository(adapter as any, MirroredRepositoryModel);
    const context = new Context();
    context.accumulate({ allowMirroring: false } as any);

    repository.applyLegacyMirrorFlag(
      context,
      new MirroredRepositoryModel({ id: "mirror-id" } as any)
    );

    expect(context.getOrUndefined("legacy")).toBeUndefined();
  });
});
