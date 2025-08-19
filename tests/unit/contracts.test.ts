import { Context } from "fabric-contract-api";
import { TestModel } from "../assets/contract/serialized-contract/TestModel";
import { TestModelContract } from "../assets/contract/serialized-contract/TestModelContract";

jest.setTimeout(5000000);

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  trace: jest.fn(),
  log: jest.fn(),
};
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
      const keys = Object.keys(state);

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
                value: { key, value: state[key] },
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
  logging: {
    getLogger: (_str: string) => {
      console.log(_str);
      return logger;
    },
  },
  identity: {
    getID: () => "id",
    getMSPID: () => "Aeon",
  },
};

describe("Tests serialization contract", () => {
  let contract: TestModelContract;

  beforeAll(async () => {
    console.log("Initializing contract");
    contract = new TestModelContract();
  });

  it("Should create", async () => {
    const m = new TestModel({ name: "Alice", nif: "12345" }).serialize();

    const res = await contract.create(ctx as unknown as Context, m);

    expect(res).toBeDefined();
  });
});
