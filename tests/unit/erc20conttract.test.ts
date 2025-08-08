import { MiniLogger } from "@decaf-ts/logging";
import { FabricContractContext } from "../../src/contracts";
import { TestERC20Contract } from "../TestModelContract";

const state: Record<string, any> = {};

const ctx = {
  stub: {
    getMspID: () => {
      return "Aeon";
    },
    setEvent: (name: string, payload: any): void => {
      console.info(
        `Event "${name}" triggered with payload of length ${payload.length}`
      );
    },
    getDateTimestamp: () => {
      return new Date();
    },
    createCompositeKey: (objectType: string, attributes: string[]) => {
      return objectType + "_" + attributes.join("_");
    },
    getState: async (key: string) => {
      if (key in state) return state[key];
      throw new Error("Missing");
    },
    putState: async (key: string, value: any) => {
      state[key] = value;
    },
    deleteState: async (key: string) => {
      if (key in state) {
        delete state[key];
        return;
      }
      throw new Error("Missing");
    },
    getQueryResultWithPagination: async (
      query: string,
      pageSize: number,
      bookmark: string
    ) => {
      const keys = Object.keys(state)
        .filter((k) => k.includes(query)) // naive "query"
        .sort();

      let startIndex = 0;
      if (bookmark) {
        const index = keys.indexOf(bookmark);
        startIndex = index >= 0 ? index + 1 : 0;
      }

      const paginatedKeys = keys.slice(startIndex, startIndex + pageSize);
      let currentIndex = 0;

      return {
        iterator: {
          async next() {
            if (currentIndex < paginatedKeys.length) {
              const key = paginatedKeys[currentIndex++];
              return {
                value: { key, value: Buffer.from(JSON.stringify(state[key])) },
                done: false,
              };
            }
            return { done: true };
          },
          async close() {
            // No-op for mock
          },
        },
      };
    },
  },
  logger: new MiniLogger(TestERC20Contract.name),
  identity: {
    getID: () => "id",
    getMSPID: () => "Aeon",
  },
} as unknown as FabricContractContext;

describe(`ERC20 token test`, function () {
  let contract: TestERC20Contract;

  beforeAll(async () => {
    contract = new TestERC20Contract();
  });
  it("initializes", async () => {
    const created = await contract.Initialize(ctx, "TestToken", "TT", 1000);
    expect(created).toBe(true);

    const tokenName = await contract.TokenName(ctx);

    expect(tokenName).toEqual("TestToken");
  });
});
