import { NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { FabricClientRepository } from "../../src/client";
import { E2eConfig } from "./e2e.config";
import { AuthorizationError, Repository } from "@decaf-ts/core";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { execSync } from "child_process";

const { adapterFactory } = E2eConfig;
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

jest.setTimeout(45000);

describe("OtherProductShared contract mirror coverage (e2e)", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let otherRepo: FabricClientRepository<OtherProductShared>;

  beforeAll(async () => {
    execSync(`npm run copy:crypto -- --org=org-a`, {
      cwd: process.cwd(),
    });
    adapter = await adapterFactory();
    otherRepo = Repository.forModel(
      OtherProductShared
    ) as FabricClientRepository<OtherProductShared>;
  });

  it("prevents mirror organizations from submitting writes", async () => {
    const productCode = makeId("mirror-write");
    const mirrorModel = new OtherProductShared({
      productCode,
      inventedName: "Mirror Write Guard",
      nameMedicinalProduct: "Guarded Product",
      ownedBy: "main-org",
    });

    const mirrorCtx = await adapter.context(
      OperationKeys.CREATE,
      { identity: "main-org" },
      OtherProductShared
    );

    await expect(otherRepo.create(mirrorModel, mirrorCtx)).rejects.toThrow(
      AuthorizationError
    );
  });

  it("routes mirror reads exclusively for the mirror MSP", async () => {
    const productCode = makeId("mirror-read");
    const sharedProduct = new OtherProductShared({
      productCode,
      inventedName: "Mirror Reader",
      nameMedicinalProduct: "Shared Mirror",
      internalMaterialCode: "MIRROR-001",
      productRecall: false,
      ownedBy: "mirror-org",
    });

    await otherRepo.create(sharedProduct);

    const mirrorReadCtx = await adapter.context(
      OperationKeys.READ,
      { identity: "main-org" },
      OtherProductShared
    );

    const mirrorResult = await otherRepo.read(productCode, mirrorReadCtx);
    expect(mirrorResult.productCode).toEqual(productCode);
    expect(mirrorResult.internalMaterialCode).toEqual("MIRROR-001");
    expect(mirrorResult.productRecall).toEqual(false);

    await otherRepo.delete(productCode);
    await expect(otherRepo.read(productCode)).rejects.toThrow(NotFoundError);
  });
});
