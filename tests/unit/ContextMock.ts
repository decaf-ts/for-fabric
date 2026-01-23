import { Logging, LogLevel } from "@decaf-ts/logging";
import { Contract } from "fabric-contract-api";
import { ModelKeys } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { Iterators } from "fabric-shim-api";

export function getStubMock() {
  const state: Record<any, any> = {};
  const privateState: Record<string, Record<string, any>> = {};

  return {
    getCreator: async () => {
      return {
        idBytes: Buffer.from("creatorID"),
        mspid: "MSPID",
      };
    },
    getTxID: () => Date.now().toString(),
    getTransient: () => {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        has: (item: any) => {
          return false;
        },
      };
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
      const testStr = typeof value === "string" ? value : value.toString();
      if (testStr.includes(ModelKeys.ANCHOR))
        throw new InternalError("Anchor keys are not allowed");
      state[key] = value;
    },
    deleteState: async (key: string) => {
      if (key in state) {
        delete state[key];
        return;
      }
      throw new Error("Missing");
    },
    getQueryResult: async (query: string) => {
      let currentIndex = 0;
      const keys = Object.keys(state);
      return {
        async next() {
          if (currentIndex < keys.length) {
            const key = keys[currentIndex++];
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
      };
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
        metadata: { bookmark: Date.now().toString() },
      };
    },

    getPrivateData(collection: string, key: string): Promise<any> {
      if (collection in privateState && key in privateState[collection])
        return privateState[collection][key];
      return "";
    },
    // getPrivateDataHash(collection: string, key: string): Promise<Uint8Array>;
    putPrivateData(
      collection: string,
      key: string,
      value: Uint8Array
    ): Promise<void> {
      const testStr = typeof value === "string" ? value : value.toString();
      if (testStr.includes(ModelKeys.ANCHOR))
        throw new InternalError("Anchor keys are not allowed");
      state[key] = value;
    },
    deletePrivateData(collection: string, key: string): Promise<void> {
      if (key in state) {
        delete state[key];
        return;
      }
      throw new Error("Missing");
    },
    // purgePrivateData(collection: string, key: string): Promise<void>;
    // setPrivateDataValidationParameter(collection: string, key: string, ep: Uint8Array): Promise<void>;
    // getPrivateDataValidationParameter(collection: string, key: string): Promise<Uint8Array>;
    // getPrivateDataByRange(collection: string, startKey: string, endKey: string): Promise<Iterators.StateQueryIterator> & AsyncIterable<Iterators.KV>;
    // getPrivateDataByPartialCompositeKey(collection: string, objectType: string, attributes: string[]): Promise<Iterators.StateQueryIterator> & AsyncIterable<Iterators.KV>;

    async getPrivateDataQueryResult(collection: string, query: string) {
      if (!(collection in this.privateState)) {
        return {
          async next() {
            return { done: true };
          },
          async close() {
            return;
          },
        };
      }
      let currentIndex = 0;
      const keys = Object.keys(state);
      return {
        async next() {
          if (currentIndex < keys.length) {
            const key = keys[currentIndex++];
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
      };
    },
  };
}

export function getIdentityMock() {
  return {
    getID: () => "id",
    getMSPID: () => "Aeon",
    getIDBytes: () => Buffer.from("creatorID"),
    getAttributeValue: (name: string) => {
      return name === "roles" ? ["admin"] : undefined;
    },
  };
}

export function getMockCtx() {
  const ctr = new Contract();
  return Object.assign(ctr.createContext(), {
    stub: getStubMock(),
    clientIdentity: getIdentityMock(),
    logging: {
      setLevel: (level: string) =>
        Logging.setConfig({ level: level as LogLevel }),
      getLogger: (name?: string) => Logging.for(name),
    },
  });
}
