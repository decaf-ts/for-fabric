import { MiniLogger } from "@decaf-ts/logging";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { SerializedCrudContract } from "../../src/contracts";
import { TestPrivateModelContract } from "../assets/contract/serialized-contract-private-model/TestPrivateModelContract";
import { TestPrivateModel } from "../assets/contract/serialized-contract-private-model/TestPrivateModel";

const state: Record<string, any> = {};
const privateState: Record<string, any> = {};

const ctx = {
  stub: {
    getTransient: () => {
      return {
        has: (item: any) => {
          return false;
        },
      };
    },
    putPrivateData: (collection: string, key: string, value: any) => {
      privateState[collection] = privateState[collection] || {};
      privateState[collection][key] = value;
    },
    getPrivateData: (collection: string, key: string) => {
      if (collection in privateState) {
        const state = privateState[collection];
        if (key in state) return state[key];
      }
      return "";
    },
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
      return "";
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
  logger: new MiniLogger(SerializedCrudContract.name),
  identity: {
    getID: () => "id",
    getMSPID: () => "Aeon",
  },
} as unknown as FabricContractContext;

describe("Tests Public contract", () => {
  const contract = new TestPrivateModelContract();
  it("should create model", async () => {
    const model = new TestPrivateModel({
      id: 1,
      name: "John Doe",
      nif: "123456789",
    });

    const res = await contract.create(ctx as any, model.serialize());

    console.log("Result: ", privateState);
    console.log("Result: ", state);
  });
});
