/* eslint-disable @typescript-eslint/no-unused-vars */
import { E2eConfig } from "./e2e.config";
import { OrderDirection, Repository } from "@decaf-ts/core";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { FabricClientRepository } from "../../src/client/index";
import {
  SegregatedPrivateDocument,
  SegregatedSharedDocument,
} from "../../src/contract/models/SegregatedDocument";
import { Logging, LogLevel } from "@decaf-ts/logging";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory } = E2eConfig;

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

describe("Segregated private/shared data e2e flows", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let privateRepo: FabricClientRepository<SegregatedPrivateDocument>;
  let sharedRepo: FabricClientRepository<SegregatedSharedDocument>;

  beforeAll(async () => {
    adapter = await adapterFactory();
    privateRepo = Repository.forModel(
      SegregatedPrivateDocument
    ) as FabricClientRepository<SegregatedPrivateDocument>;
    sharedRepo = Repository.forModel(
      SegregatedSharedDocument
    ) as FabricClientRepository<SegregatedSharedDocument>;
  });

  describe("Segregated private document lifecycle", () => {
    const docId = makeId("seg-priv");

    it("creates, updates, and deletes private fields across collections", async () => {
      const createModel = new SegregatedPrivateDocument({
        id: docId,
        title: "Private Document",
        privateNoteA: "note-a",
        privateNoteB: "note-b",
      });

      const created = await privateRepo.create(createModel);
      expect(created.id).toEqual(docId);
      expect(created.privateNoteA).toEqual("note-a");
      expect(created.privateNoteB).toEqual("note-b");

      const updatedModel = new SegregatedPrivateDocument({
        id: created.id,
        title: "Private Document Updated",
        privateNoteA: "note-a-updated",
        privateNoteB: "note-b-updated",
      });

      const updated = await privateRepo.update(updatedModel);
      expect(updated.privateNoteA).toEqual("note-a-updated");
      expect(updated.privateNoteB).toEqual("note-b-updated");

      const read = await privateRepo.read(docId);
      expect(read.privateNoteA).toEqual("note-a-updated");
      expect(read.privateNoteB).toEqual("note-b-updated");

      await privateRepo.delete(docId);
      await expect(privateRepo.read(docId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("Segregated shared document lifecycle", () => {
    const sharedId = makeId("seg-shared");

    it("persists shared fields on multiple collections", async () => {
      const sharedModel = new SegregatedSharedDocument({
        id: sharedId,
        name: "Shared Document",
        sharedNoteA: "shared-a",
        sharedNoteB: "shared-b",
      });

      const created = await sharedRepo.create(sharedModel);
      expect(created.sharedNoteA).toEqual("shared-a");
      expect(created.sharedNoteB).toEqual("shared-b");

      const refreshed = await sharedRepo.read(sharedId);
      expect(refreshed.sharedNoteA).toEqual("shared-a");
      expect(refreshed.sharedNoteB).toEqual("shared-b");

      const updatedShared = new SegregatedSharedDocument({
        id: sharedId,
        name: "Shared Document Updated",
        sharedNoteA: "shared-a-updated",
        sharedNoteB: "shared-b-updated",
      });

      const updated = await sharedRepo.update(updatedShared);
      expect(updated.sharedNoteA).toEqual("shared-a-updated");
      expect(updated.sharedNoteB).toEqual("shared-b-updated");

      await sharedRepo.delete(sharedId);
      await expect(sharedRepo.read(sharedId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("Segregated private/shared querying and pagination", () => {
    it("queries and paginates private documents", async () => {
      const batch = new Array(6).fill(0).map((_, index) => {
        const id = makeId(`seg-priv-${index}`);
        return new SegregatedPrivateDocument({
          id,
          title: `Private ${index}`,
          privateNoteA: `privateA-${index}`,
          privateNoteB: `privateB-${index}`,
        });
      });

      const privateDocs = await privateRepo.createAll(batch);
      const createdIds = privateDocs.map((doc) => doc.id);

      const all = await privateRepo
        .select()
        .orderBy(["createdAt", OrderDirection.DESC])
        .execute();
      expect(all.map((doc) => doc.id)).toEqual(
        expect.arrayContaining(createdIds)
      );

      const pagination = await privateRepo
        .select()
        .orderBy(["createdAt", OrderDirection.DESC])
        .paginate(3);
      const page1 = await pagination.page(1);
      expect(page1).toHaveLength(3);
      expect(page1.every((doc) => doc.privateNoteA)).toEqual(true);
      expect(pagination["_bookmark"]).toBeDefined();
      const page2 = await pagination.next();
      expect(page2).toHaveLength(3);
    });

    it("queries and paginates shared documents", async () => {
      const batch = new Array(4).fill(0).map((_, index) => {
        const id = makeId(`seg-shared-${index}`);
        return new SegregatedSharedDocument({
          id,
          name: `Shared ${index}`,
          sharedNoteA: `sharedA-${index}`,
          sharedNoteB: `sharedB-${index}`,
        });
      });

      const sharedDocs = await sharedRepo.createAll(batch);
      const createdIds = sharedDocs.map((doc) => doc.id);

      const all = await sharedRepo
        .select()
        .orderBy(["createdAt", OrderDirection.DESC])
        .execute();
      expect(all.map((doc) => doc.id)).toEqual(
        expect.arrayContaining(createdIds)
      );

      const pagination = await sharedRepo
        .select()
        .orderBy(["createdAt", OrderDirection.DESC])
        .paginate(2);
      const page1 = await pagination.page(1);
      expect(page1).toHaveLength(2);
      expect(page1.some((doc) => createdIds.includes(doc.id))).toEqual(true);
      expect(page1.every((doc) => doc.sharedNoteA)).toEqual(true);
      const page2 = await pagination.next();
      expect(page2).toHaveLength(2);
    });
  });
});
