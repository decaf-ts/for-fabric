/* eslint-disable @typescript-eslint/no-unused-vars */
import { NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Repository, AuthorizationError } from "@decaf-ts/core";
import { FabricClientRepository } from "../../src/client";
import { E2eConfig } from "./e2e.config";
import {
  SegregatedPrivateDocument,
  SegregatedSharedDocument,
} from "../../src/contract/models/SegregatedDocument";
import { execSync } from "child_process";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";

const { adapterFactory } = E2eConfig;
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

jest.setTimeout(45000);

describe("Segregated private/shared data flows (e2e)", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let privateRepo: FabricClientRepository<SegregatedPrivateDocument>;
  let sharedRepo: FabricClientRepository<SegregatedSharedDocument>;
  let otherRepo: FabricClientRepository<OtherProductShared>;

  beforeAll(async () => {
    execSync(`npm run copy:crypto -- --org=org-b`, {
      cwd: process.cwd(),
    });

    adapter = await adapterFactory();
    privateRepo = Repository.forModel(
      SegregatedPrivateDocument
    ) as FabricClientRepository<SegregatedPrivateDocument>;
    sharedRepo = Repository.forModel(
      SegregatedSharedDocument
    ) as FabricClientRepository<SegregatedSharedDocument>;
    otherRepo = Repository.forModel(
      OtherProductShared
    ) as FabricClientRepository<OtherProductShared>;
  });

  it("keeps private attributes consistent across lifecycle", async () => {
    const docId = makeId("seg-priv");
    const createModel = new SegregatedPrivateDocument({
      id: docId,
      title: "Private Note Example",
      privateNoteA: "private-a",
      privateNoteB: "private-b",
    });

    const created = await privateRepo.create(createModel);
    expect(created.id).toEqual(docId);
    expect(created.privateNoteA).toEqual("private-a");
    expect(created.privateNoteB).toEqual("private-b");

    const updatedModel = new SegregatedPrivateDocument({
      id: docId,
      title: "Private Note Example Updated",
      privateNoteA: "private-a-updated",
      privateNoteB: "private-b-updated",
    });
    const updated = await privateRepo.update(updatedModel);
    expect(updated.privateNoteA).toEqual("private-a-updated");
    expect(updated.privateNoteB).toEqual("private-b-updated");

    const read = await privateRepo.read(docId);
    expect(read.privateNoteA).toEqual("private-a-updated");
    expect(read.privateNoteB).toEqual("private-b-updated");

    await privateRepo.delete(docId);
    await expect(privateRepo.read(docId)).rejects.toThrow(NotFoundError);
  });

  it("propagates shared attributes for partially segregated models", async () => {
    const sharedId = makeId("seg-shared");
    const sharedModel = new SegregatedSharedDocument({
      id: sharedId,
      name: "Shared Case",
      sharedNoteA: "shared-a",
      sharedNoteB: "shared-b",
    });

    const created = await sharedRepo.create(sharedModel);
    expect(created.id).toEqual(sharedId);
    expect(created.sharedNoteA).toEqual("shared-a");
    expect(created.sharedNoteB).toEqual("shared-b");

    const refreshed = await sharedRepo.read(sharedId);
    expect(refreshed.sharedNoteA).toEqual("shared-a");
    expect(refreshed.sharedNoteB).toEqual("shared-b");

    const updatedShared = new SegregatedSharedDocument({
      id: sharedId,
      name: "Shared Case Updated",
      sharedNoteA: "shared-a-updated",
      sharedNoteB: "shared-b-updated",
    });
    const updated = await sharedRepo.update(updatedShared);
    expect(updated.sharedNoteA).toEqual("shared-a-updated");
    expect(updated.sharedNoteB).toEqual("shared-b-updated");

    await sharedRepo.delete(sharedId);
    await expect(sharedRepo.read(sharedId)).rejects.toThrow(NotFoundError);
  });

  it("creates a fully shared product and returns every marked attribute", async () => {
    const productCode = makeId("other-product");
    const product = new OtherProductShared({
      productCode,
      inventedName: "Unified Aspirin",
      nameMedicinalProduct: "Aspirin 100",
      internalMaterialCode: "IMC-101",
      productRecall: true,
      ownedBy: "main-org",
    });

    const created = await otherRepo.create(product);
    expect(created.productCode).toEqual(productCode);
    expect(created.inventedName).toEqual("Unified Aspirin");
    expect(created.internalMaterialCode).toEqual("IMC-101");
    expect(created.productRecall).toEqual(true);

    await otherRepo.delete(productCode);
    await expect(otherRepo.read(productCode)).rejects.toThrow(NotFoundError);
  });
});
