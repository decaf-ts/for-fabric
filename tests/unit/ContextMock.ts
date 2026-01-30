import { Logging, LogLevel } from "@decaf-ts/logging";
import { Contract } from "fabric-contract-api";
import { ModelKeys } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { ClientIdentity, Iterators } from "fabric-shim-api";
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
  switch (operator) {
    case "$gt":
      return value > comparison;
    case "$gte":
      return value >= comparison;
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
  const state: Record<string, Buffer> = {};
  const privateState: Record<string, Record<string, Buffer>> = {};

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
      state[key] = toBuffer(value);
    },
    deleteState: async (key: string) => {
      if (key in state) {
        delete state[key];
        return;
      }
      throw new Error("Missing");
    },
    getQueryResult: async (query: string) => {
      const { selector, sort } = parseQuery(query);
      const rows = filterRows(state, selector, sort);
      return createIterator(rows);
    },

    getQueryResultWithPagination: async (
      query: string,
      pageSize: number,
      bookmark: string
    ) => {
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
      if (!privateState[collection]) privateState[collection] = {};
      privateState[collection][key] = toBuffer(value);
    },
    deletePrivateData(collection: string, key: string): Promise<void> {
      if (privateState[collection] && key in privateState[collection]) {
        delete privateState[collection][key];
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
