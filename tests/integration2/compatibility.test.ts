import { Observer, PersistenceService, Repository } from "@decaf-ts/core";
import { FabricClientAdapter } from "../../src/index";
import { getOrgEnv } from "./environment";
import { OtherProductShared } from "../../src/contract/trackedModels/OtherProductShared";
import { generateGtin } from "../../src/contract/models/gtin";
import { Product } from "../../src/contract/models/Product";

describe("Full compatibility test", () => {
  let mock = jest.fn();
  let observer: Observer;

  beforeAll(async () => {
    const persistenceLayer = new PersistenceService();
    const cfg = [[FabricClientAdapter, getOrgEnv("Pdm")]];
    await persistenceLayer.initialize(cfg);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();

    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    // repo.observe(observer);
  });

  afterEach(() => {
    // repo.unObserve(observer);
  });

  it("Creates a product", async () => {
    const repo = Repository.forModel(OtherProductShared);
    const id = generateGtin();
    const model = new Product({
      productCode: id,
      inventedName: "test_name",
      nameMedicinalProduct: "123456789",
      strengths: [
        {
          productCode: id,
          strength: "200mg",
          substance: "Ibuprofen",
        },
        {
          productCode: id,
          strength: "400mg",
          substance: "Ibuprofen",
        },
      ],
      markets: [
        {
          productCode: id,
          marketId: "BR",
          nationalCode: "BR",
          mahName: "ProPharma BR",
        },
        {
          productCode: id,
          marketId: "US",
          nationalCode: "US",
          mahName: "ProPharma US",
        },
      ],
    });

    const created = await repo.create(model);

    expect(created).toBeDefined();
  });
});
