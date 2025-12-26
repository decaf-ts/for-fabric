import { FabricContractAdapter, FabricCrudContract } from "../../src/index";
console.log("Using adapter:", FabricContractAdapter.name);
import { getMockCtx } from "./ContextMock";
import { ProductContract } from "../../src/contract/ProductContract";
import { generateGtin } from "../../src/contract/models/gtin";
import { Product } from "../../src/contract/models/Product";
import { Constructor } from "@decaf-ts/decoration";
import { Logging, LogLevel, style } from "@decaf-ts/logging";
Logging.setConfig({ level: LogLevel.debug });

const logger = Logging.for("unit-product");
describe("Tests Product Contract", () => {
  const contract = new ProductContract();

  let contextFactoryMock: jest.SpyInstance;
  let adapterContextFactory: any;

  function MockCtxFactory(
    op: string,
    overrides: Partial<any>,
    model: Constructor,
    ...args: any[]
  ) {
    const log = logger
      .for(style("adapter context factory").green.bold)
      .for(expect.getState().currentTestName);
    try {
      log.info(
        `adapter context called with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      log.warn(
        `adapter context called with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
      );
    }
    return adapterContextFactory(op, overrides, model, ...args);
  }

  let created: Product;

  beforeEach(() => {
    adapterContextFactory = FabricCrudContract["adapter"].context.bind(
      FabricCrudContract["adapter"]
    );
    contextFactoryMock = jest
      .spyOn(FabricCrudContract["adapter"], "context")
      .mockImplementation(MockCtxFactory);
  });

  it("creates", async () => {
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

    contextFactoryMock.mockImplementationOnce(
      (
        op: string,
        overrides: Partial<any>,
        model: Constructor,
        ...args: any[]
      ) => {
        const log = logger
          .for(style("adapter context factory").blue.bold)
          .for(expect.getState().currentTestName);
        try {
          log.info(
            `adapter context called for the first time with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          log.warn(
            `adapter context called for the first time with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
          );
        }
        return adapterContextFactory(
          op,
          Object.assign({}, overrides, {
            PERSISTENT_PROPERTY: true,
          }),
          model,
          ...args
        );
      }
    );

    const createdStr = await contract.create(getMockCtx(), model.serialize());
    created = new Product(JSON.parse(createdStr));
    expect(created).toBeDefined();
    expect(created.strengths.length).toEqual(2);
    expect(created.markets.length).toEqual(2);
  });
});
