import { Adapter } from "@decaf-ts/core";
import { FabricFlavour } from "../../src/shared/constants";
import { Info } from "fabric-contract-api";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
FabricContractAdapter.decoration();
Adapter.setCurrent(FabricFlavour);
import { NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { getMockCtx } from "./ContextMock";
import { Model } from "@decaf-ts/decorator-validation";

@Info({
  title: "ProductContract",
  description: "Test implementation of serialized crud contract",
})
export class TestProductContract extends SerializedCrudContract<Product> {
  constructor() {
    super(TestProductContract.name, Product);
  }
}

describe("Inheritance and attribute generation", () => {
  let created: Product;
  const ctx = getMockCtx();
  const contract = new TestProductContract();

  it.only("creates", async () => {
    const id = Date.now().toString();
    const model = new Product({
      productCode: id,
      inventedName: "Azitrex",
      nameMedicinalProduct: "Azithromycin",
      acfProductCheckURL: "https://example.com/check",
    });

    created = new Product(
      JSON.parse(await contract.create(ctx as any, model.serialize()))
    );

    expect(created).toBeDefined();
    expect(created.hasErrors()).toBeUndefined();
  });

  it("reads", async () => {
    const read = new Product(
      await contract.read(ctx as any, created.productCode)
    );

    expect(read).toBeDefined();
    expect(read.equals(created)).toBe(true);
  });

  it("updates", async () => {
    const toUpdate = new Product(
      Object.assign({}, created, {
        inventedName: "new_test_name",
      })
    );

    const updated = Model.deserialize(
      await contract.update(ctx as any, toUpdate.serialize())
    );

    expect(created).toBeDefined();
    expect(created.hasErrors()).toBeUndefined();
    expect(updated.equals(created)).toEqual(false);
    expect(
      updated.equals(
        created,
        "updatedAt",
        "inventedName",
        "updatedBy",
        "version"
      )
    ).toEqual(true); // minus the expected changes
  });

  it("deletes", async () => {
    const deleted = new Product(await contract.read(ctx, created.productCode));

    expect(deleted).toBeDefined();
    expect(deleted.productCode).toEqual(created.productCode); // same model
    await expect(
      contract.read(ctx, created.productCode as string)
    ).rejects.toThrowError(NotFoundError);
  });
});
