import { MiniLogger } from "@decaf-ts/logging";
import { TestPublicModelContract } from "../assets/contract/serialized-contract-public-model/TestPublicModelContract";
import { TestPublicModel } from "../assets/contract/serialized-contract-public-model/TestPublicModel";
import { getMockCtx } from "./Context.mock";

const logger = new MiniLogger("public-model-test") as any;
if (typeof logger.for !== "function") {
  logger.for = jest.fn().mockReturnValue(logger);
}
if (typeof logger.clear !== "function") {
  logger.clear = jest.fn().mockReturnValue(logger);
}

describe("Tests Public contract", () => {
  const ctx = getMockCtx();
  const contract = new TestPublicModelContract();
  it("should create model", async () => {
    const model = new TestPublicModel({
      id: 1,
      name: "John Doe",
      nif: "123456789",
    });

    const res = await contract.create(ctx as any, model.serialize());

    console.log("Result: ", res);
  });
});
