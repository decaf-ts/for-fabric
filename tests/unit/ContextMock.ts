import { Logging, LogLevel } from "@decaf-ts/logging";
import { Contract } from "fabric-contract-api";
import { ModelKeys } from "@decaf-ts/decorator-validation";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { ClientIdentity } from "fabric-shim-api";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

function parseQuery(query: string) {
  try {
    return JSON.parse(query);
  } catch {
    return {};
  }
}

function normalizeDocument(value: any, key: string) {
  let doc: any = value;
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    const text = Buffer.from(value).toString("utf8");
    try {
      doc = JSON.parse(text);
    } catch {
      doc = text;
    }
  } else if (typeof value === "string") {
    try {
      doc = JSON.parse(value);
    } catch {
      doc = value;
    }
  }
  if (doc && typeof doc === "object") {
    doc[CouchDBKeys.ID] = key;
    doc["_id"] = key;
  }
  return doc;
}

function toBuffer(value: any) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  try {
    return Buffer.from(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.from(String(value), "utf8");
  }
}

function getFieldValue(doc: any, field: string) {
  if (!doc || typeof doc !== "object") return undefined;
  return doc[field];
}

function applyOperator(operator: string, value: any, comparison: any) {
  if (value === undefined) return false;
  const isNullale = comparison === null || comparison === undefined;
  switch (operator) {
    case "$gt":
      return isNullale || value > comparison;
    case "$gte":
      return isNullale || value >= comparison;
    case "$lt":
      return value < comparison;
    case "$lte":
      return value <= comparison;
    case "$eq":
      return value === comparison;
    case "$ne":
      return value !== comparison;
    case "$in":
      return Array.isArray(comparison) && comparison.includes(value);
    case "$nin":
      return Array.isArray(comparison) && !comparison.includes(value);
    case "$exists":
      return (value !== undefined) === Boolean(comparison);
    case "$regex":
      try {
        const regex = new RegExp(comparison);
        return regex.test(String(value));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function matchesSelector(doc: any, selector?: any): boolean {
  if (!selector) return true;
  if (Array.isArray(selector)) {
    return selector.every((sub) => matchesSelector(doc, sub));
  }
  for (const [key, condition] of Object.entries(selector)) {
    if (key === "$and" && Array.isArray(condition))
      return condition.every((sub) => matchesSelector(doc, sub));
    if (key === "$or" && Array.isArray(condition))
      return condition.some((sub) => matchesSelector(doc, sub));
    if (key === "$nor" && Array.isArray(condition))
      return !condition.some((sub) => matchesSelector(doc, sub));
    const value = getFieldValue(doc, key);
    if (
      condition &&
      typeof condition === "object" &&
      !Array.isArray(condition)
    ) {
      for (const [op, comp] of Object.entries(condition)) {
        if (!applyOperator(op, value, comp)) return false;
      }
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}

function filterRows(store: Record<string, any>, selector?: any, sort?: any[]) {
  const entries = Object.entries(store).map(([key, value]) => ({
    key,
    value,
    doc: normalizeDocument(value, key),
  }));
  let rows = entries.filter((row) => matchesSelector(row.doc, selector));
  if (sort && sort.length) {
    const [spec] = sort;
    const [field, direction] = Object.entries(spec)[0];
    const dir = String(direction).toLowerCase() === "desc" ? -1 : 1;
    rows = rows.sort((a, b) => {
      const aVal = getFieldValue(a.doc, field);
      const bVal = getFieldValue(b.doc, field);
      if (aVal === bVal) return 0;
      if (aVal === undefined) return -dir;
      if (bVal === undefined) return dir;
      return aVal > bVal ? dir : -dir;
    });
  } else {
    rows = rows.sort((a, b) => a.key.localeCompare(b.key));
  }
  return rows;
}

function createIterator(rows: Array<{ key: string; value: any }>) {
  let idx = 0;
  return {
    async next() {
      if (idx < rows.length) {
        const row = rows[idx++];
        return {
          value: { key: row.key, value: toBuffer(row.value) },
          done: false,
        };
      }
      return { done: true };
    },
    async close() {
      // noop
    },
  };
}

export function getStubMock() {
  // Committed (persisted) state — only visible after commit()
  const state: Record<string, Buffer> = {};
  const privateState: Record<string, Record<string, Buffer>> = {};

  // Pending (uncommitted) write set — mimics Fabric's transaction write set
  // In real Fabric, getState does NOT see uncommitted putState writes within the same transaction.
  const pendingState: Record<string, Buffer> = {};
  const pendingDeletes: Set<string> = new Set();
  const pendingPrivateState: Record<string, Record<string, Buffer>> = {};
  const pendingPrivateDeletes: Record<string, Set<string>> = {};

  return {
    state: state,
    privateState: privateState,
    /**
     * Commits all pending writes/deletes to the committed state.
     * Call this after every contract method invocation to simulate
     * end-of-transaction persistence in Hyperledger Fabric.
     */
    commit: () => {
      // Apply public state writes
      for (const [key, value] of Object.entries(pendingState)) {
        state[key] = value;
      }
      // Apply public state deletes
      for (const key of pendingDeletes as any[]) {
        delete state[key];
      }
      // Clear public pending buffers
      Object.keys(pendingState).forEach((k) => delete pendingState[k]);
      pendingDeletes.clear();

      // Apply private state writes
      for (const [collection, entries] of Object.entries(pendingPrivateState)) {
        if (!privateState[collection]) privateState[collection] = {};
        for (const [key, value] of Object.entries(entries)) {
          privateState[collection][key] = value;
        }
      }
      // Apply private state deletes
      for (const [collection, keys] of Object.entries(pendingPrivateDeletes)) {
        if (privateState[collection]) {
          for (const key of keys as any[]) {
            delete privateState[collection][key];
          }
        }
      }
      // Clear private pending buffers
      Object.keys(pendingPrivateState).forEach(
        (k) => delete pendingPrivateState[k]
      );
      Object.keys(pendingPrivateDeletes).forEach(
        (k) => delete pendingPrivateDeletes[k]
      );
    },

    getCreator: async () => {
      return {
        idBytes: Buffer.from("creatorID"),
        mspid: "Aeon",
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
      // Reads only from committed state (Fabric behaviour)
      if (key in state) return state[key];
      throw new NotFoundError(`State key ${key} not found`);
    },
    putState: async (key: string, value: any) => {
      const testStr = typeof value === "string" ? value : value.toString();
      if (testStr.includes(ModelKeys.ANCHOR))
        throw new InternalError("Anchor keys are not allowed");
      // Write to pending (uncommitted) buffer
      await new Promise((resolve) => setTimeout(resolve, 100));
      pendingState[key] = toBuffer(value);
      pendingDeletes.delete(key);
    },
    deleteState: async (key: string) => {
      if (key in state || key in pendingState) {
        // Mark for deletion in pending buffer
        pendingDeletes.add(key);
        delete pendingState[key];
        return;
      }
      throw new Error("Missing");
    },
    getQueryResult: async (query: string) => {
      // Queries only committed state (Fabric behaviour)
      const { selector, sort } = parseQuery(query);
      const rows = filterRows(state, selector, sort);
      return createIterator(rows);
    },

    getQueryResultWithPagination: async (
      query: string,
      pageSize: number,
      bookmark: string
    ) => {
      // Queries only committed state (Fabric behaviour)
      const { selector, sort } = parseQuery(query);
      const rows = filterRows(state, selector, sort);
      let startIndex = 0;
      if (bookmark) {
        const found = rows.findIndex((row) => row.key === bookmark);
        startIndex = found >= 0 ? found + 1 : 0;
      }
      const paginated = rows.slice(startIndex, startIndex + pageSize);
      const iterator = createIterator(paginated);
      const lastKey =
        paginated.length > 0
          ? paginated[paginated.length - 1].key
          : bookmark || "";
      return {
        iterator,
        metadata: {
          bookmark: lastKey,
          fetchedRecordsCount: paginated.length,
        },
      };
    },

    async getPrivateData(collection: string, key: string): Promise<any> {
      // Reads only from committed private state
      if (collection in privateState && key in privateState[collection])
        return privateState[collection][key];
      throw new NotFoundError(`State key ${key} not found`);
    },
    // getPrivateDataHash(collection: string, key: string): Promise<Uint8Array>;
    async putPrivateData(
      collection: string,
      key: string,
      value: Uint8Array
    ): Promise<void> {
      const testStr = typeof value === "string" ? value : value.toString();
      if (testStr.includes(ModelKeys.ANCHOR))
        throw new InternalError("Anchor keys are not allowed");
      // Write to pending private buffer
      if (!pendingPrivateState[collection])
        pendingPrivateState[collection] = {};
      pendingPrivateState[collection][key] = toBuffer(value);
      if (pendingPrivateDeletes[collection])
        pendingPrivateDeletes[collection].delete(key);
    },
    deletePrivateData(collection: string, key: string): Promise<void> {
      if (
        (privateState[collection] && key in privateState[collection]) ||
        (pendingPrivateState[collection] &&
          key in pendingPrivateState[collection])
      ) {
        if (!pendingPrivateDeletes[collection])
          pendingPrivateDeletes[collection] = new Set();
        pendingPrivateDeletes[collection].add(key);
        if (pendingPrivateState[collection])
          delete pendingPrivateState[collection][key];
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
      // Queries only committed private state
      const { selector, sort } = parseQuery(query);
      const rows = filterRows(privateState[collection] || {}, selector, sort);
      return createIterator(rows);
    },
  };
}

export function getIdentityMock(): ClientIdentity {
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
