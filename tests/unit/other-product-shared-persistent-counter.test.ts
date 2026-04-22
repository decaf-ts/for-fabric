import "../../src/shared/overrides";

import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { SequenceModel } from "@decaf-ts/core";
import { getMockCtx } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";

jest.setTimeout(30000);

describe("OtherProductShared persistent counter (@version(true))", () => {
  const collection = "decaf-namespaceAeon";
  const seqTable = Model.tableName(SequenceModel as any);

  function ensureCommitted(stub: any) {
    if (stub && typeof stub.commit === "function") stub.commit();
  }

  function sequenceIdForCounter(productCode: string) {
    return Model.sequenceName(OtherProductShared, productCode, "counter");
  }

  function buildProduct(productCode: string, overrides: Partial<any> = {}) {
    return new OtherProductShared({
      productCode,
      inventedName: "Invented",
      nameMedicinalProduct: "Medicinal",
      productRecall: false,
      ...overrides,
    } as any);
  }

  it("increments across update/delete/re-create and stores the sequence only in the attribute collections", async () => {
    const ctx = getMockCtx();
    const stub = (ctx as any).stub;
    const contract = new OtherProductSharedContract();

    // For shared models, private/shared properties are expected to be passed as transient.
    let transient: Record<string, any> = {};
    jest
      .spyOn(contract as any, "getTransientData")
      .mockImplementation(() => transient);

    function preparePayload(model: OtherProductShared): string {
      const segregated = Model.segregate(model);
      transient = segregated.transient || {};
      return segregated.model.serialize();
    }

    async function loadSharedProduct(productCode: string) {
      ensureCommitted(stub);
      const key = stub.createCompositeKey("other_product_shared", [productCode]);
      const raw = await stub.getPrivateData(collection, key);
      const json =
        raw instanceof Buffer ? raw.toString("utf8") : Buffer.from(raw).toString("utf8");
      return new OtherProductShared(JSON.parse(json));
    }

    const productCode = generateGtin();

    // create
    await contract.create(ctx as any, preparePayload(buildProduct(productCode)));
    const created = await loadSharedProduct(productCode);
    expect(created.counter).toBe(1);

    // update twice
    const beforeUpd1 = await loadSharedProduct(productCode);
    const upd1Raw = (await contract.update(
      ctx as any,
      preparePayload(
        buildProduct(productCode, {
          counter: beforeUpd1.counter,
          inventedName: "Invented-2",
        } as any)
      )
    )) as string;
    void upd1Raw;
    const upd1 = await loadSharedProduct(productCode);
    expect(upd1.counter).toBe(2);

    const beforeUpd2 = await loadSharedProduct(productCode);
    const upd2Raw = (await contract.update(
      ctx as any,
      preparePayload(
        buildProduct(productCode, {
          counter: beforeUpd2.counter,
          inventedName: "Invented-3",
        } as any)
      )
    )) as string;
    void upd2Raw;
    const upd2 = await loadSharedProduct(productCode);
    expect(upd2.counter).toBe(3);

    // validate sequence is not in public state
    ensureCommitted(stub);
    const seqId = sequenceIdForCounter(productCode);
    const seqKey = stub.createCompositeKey(seqTable, [seqId]);
    await expect(stub.getState(seqKey)).rejects.toThrow(NotFoundError);

    // validate it is in the shared private collection
    const seqPrivate = await stub.getPrivateData(collection, seqKey);
    const seqDoc = JSON.parse(
      Buffer.isBuffer(seqPrivate) ? seqPrivate.toString("utf8") : seqPrivate
    );
    expect(seqDoc.id).toBe(seqId);
    expect(seqDoc.current).toBe(3);

    // and not in the mirror collection
    await expect(stub.getPrivateData("mirror-collection", seqKey)).rejects.toThrow(
      NotFoundError
    );

    // delete and re-create should continue counter
    await contract.delete(ctx as any, productCode);
    ensureCommitted(stub);

    // sequence must persist even after the model is deleted
    const seqAfterDeleteRaw = await stub.getPrivateData(collection, seqKey);
    const seqAfterDelete = JSON.parse(
      Buffer.isBuffer(seqAfterDeleteRaw)
        ? seqAfterDeleteRaw.toString("utf8")
        : Buffer.from(seqAfterDeleteRaw).toString("utf8")
    );
    expect(seqAfterDelete.current).toBe(3);

    await contract.create(ctx as any, preparePayload(buildProduct(productCode)));
    const recreated = await loadSharedProduct(productCode);
    const counterSeqKeys = Object.keys((stub as any).privateState?.[collection] || {})
      .filter((k) => k.startsWith(`${seqTable}_`))
      .filter((k) => k.endsWith("_counter"));
    expect(counterSeqKeys).toContain(seqKey);
    const seqAfterRecreateRaw = await stub.getPrivateData(collection, seqKey);
    const seqAfterRecreate = JSON.parse(
      Buffer.isBuffer(seqAfterRecreateRaw)
        ? seqAfterRecreateRaw.toString("utf8")
        : Buffer.from(seqAfterRecreateRaw).toString("utf8")
    );
    expect(seqAfterRecreate.current).toBe(4);
    expect(recreated.counter).toBe(4);
  });
});
