import { IndexMetadata, OrderDirection } from "@decaf-ts/core";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";

export type Index = {
  index: {
    fields: string[] | { [k: string]: OrderDirection };
  };
  ddoc?: string;
  name: string;
  type: "json";
};

function getIndexReference(
  name: string[],
  direction?: OrderDirection,
  compositions?: string[]
) {
  return [
    ...name.map((n) => (n === CouchDBKeys.TABLE ? "table" : n)),
    ...(compositions || []),
    ...(direction ? [direction] : []),
    "index",
  ].join(Metadata.splitter);
}

function addIndex(
  accum: Record<string, any>,
  fields: string[],
  direction?: OrderDirection,
  compositions?: string[]
) {
  const name = getIndexReference(fields, direction, compositions);

  let f: string[] | { [k: string]: OrderDirection }[] = [
    ...fields,
    ...(compositions || []),
  ];

  if (direction)
    f = f.reduce((accum: { [k: string]: OrderDirection }[], el: string) => {
      const entry: Record<string, any> = {};
      entry[el] = direction;
      accum.push(entry);
      return accum;
    }, []);

  const index: Index = {
    index: {
      fields: f,
    },
    name: name,
    ddoc: name,
    type: "json",
  } as Index;

  accum[name] = index;
}

export function generateModelIndexes<M extends Model>(
  m: Constructor<M>,
  accum?: Record<string, any>
): Index[] {
  const tableName = getIndexReference([CouchDBKeys.TABLE]);
  const indexes: Record<string, Index> = accum || {};
  indexes[tableName] = {
    index: {
      fields: [CouchDBKeys.TABLE],
    },
    name: tableName,
    ddoc: tableName,
    type: "json",
  };

  const result: Record<string, any> = {};

  const modelIndexes = Model.indexes(m);
  for (const prop of Object.keys(modelIndexes)) {
    for (const [, dec] of Object.entries(modelIndexes[prop])) {
      const directions = (dec as IndexMetadata)
        .directions as unknown as OrderDirection[];
      const compositions = (dec as IndexMetadata).compositions;
      const fields = [prop, CouchDBKeys.TABLE];

      addIndex(result, fields);
      if (compositions && compositions.length)
        addIndex(result, fields, undefined, compositions);
      if (directions && directions.length) {
        directions.forEach((d) => {
          addIndex(result, fields, d);
          if (compositions && compositions.length)
            addIndex(result, fields, d, compositions);
        });
      }
    }
  }

  Object.entries(result).forEach(([key, value]) => {
    indexes[key] = value;
  });
  return Object.values(result);
}

export function readModelFile(file: any) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exports = require(path.join(process.cwd(), file.parentPath, file.name));

  const values = Object.values(exports).filter((e) => {
    try {
      const m = new (e as Constructor)();
      return m instanceof Model;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      return false;
    }
  }) as ModelConstructor<any>[];
  return values;
}

export async function readModelFolders(
  ...folders: string[]
): Promise<ModelConstructor<any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");

  const result: ModelConstructor<any>[] = [];

  for (const folder of folders) {
    const files = fs
      .readdirSync(folder, {
        withFileTypes: true,
        recursive: true,
      })
      .filter((f: any) => f.isFile() && f.name.endsWith("js"));
    for (const file of files) {
      result.push(...readModelFile(file));
    }
  }
  return result;
}

export function writeIndexes(indexes: Index[], p: string = process.cwd()) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  function ensureDirectoryExistence(filePath: string) {
    const dirname: string = path.dirname(filePath) as string;
    if (fs.existsSync(dirname)) {
      return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
  }

  indexes.forEach((index) => {
    const file = path.resolve(
      path.join(p, `./META-INF/statedb/couchdb/indexes/${index.name}.json`)
    );
    ensureDirectoryExistence(file);
    fs.writeFileSync(file, JSON.stringify(index, undefined, 2));
  });
}

export type PrivateCollection = {
  name: string;
  policy: string;
  requiredPeerCount: number;
  maxPeerCount: number;
  blockToLive: number;
  memberOnlyRead: boolean;
  memberOnlyWrite: boolean;
  endorsementPolicy?: {
    signaturePolicy: string;
  };
};

export function collectionFor(
  collectionName: string,
  policy: string,
  requiredPeerCount: number,
  maxPeerCount: number,
  blockToLive: number,
  memberOnlyRead: boolean,
  memberOnlyWrite: boolean
): PrivateCollection {
  return {
    name: collectionName,
    policy: policy,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite,
  };
}

export function privateCollectionFor(
  mspId: string,
  collectionName: string = `${mspId}Private`,
  requiredPeerCount: number = 0,
  maxPeerCount: number = 0,
  blockToLive: number = 0,
  memberOnlyRead: boolean = true,
  memberOnlyWrite: boolean = true
): PrivateCollection {
  return collectionFor(
    collectionName,
    `OR('${mspId}MSP.member')`,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite
  );
}

export function sharedCollectionFor(
  mspIds: string[],
  collectionName: string,
  requiredPeerCount: number = 1,
  maxPeerCount: number = 2,
  blockToLive: number = 0,
  memberOnlyRead: boolean = true,
  memberOnlyWrite: boolean = true
): PrivateCollection {
  const c = collectionFor(
    collectionName,
    `OR(${mspIds.map((m) => `'${m}MSP.member'`).join(",")})`,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite
  );
  c.endorsementPolicy = {
    signaturePolicy: `AND(${mspIds.map((m) => `'${m}MSP.peer'`).join(",")})`,
  };
  return c;
}

export function extractCollections<M extends Model>(
  m: Constructor<M>,
  mspIds: string[],
  overrides?: {
    privateCols: Partial<PrivateCollection>;
    sharedCols: Partial<PrivateCollection>;
  }
) {
  const { privateCols, sharedCols } = Model.collectionsFor(m);
  if (
    (privateCols.length && privateCols.find((p) => sharedCols.includes(p))) ||
    (sharedCols.length && sharedCols.find((s) => privateCols.includes(s)))
  ) {
    throw new InternalError(
      `Private and shared collections cannot share the same name`
    );
  }

  const privateDefaults = Object.assign(
    {},
    {
      requiredPeerCount: 0,
      maxPeerCount: 0,
      blockToLive: 0,
      memberOnlyRead: true,
      memberOnlyWrite: true,
    },
    overrides?.privateCols || {}
  );
  const sharedDefaults = Object.assign(
    {},
    {
      requiredPeerCount: 1,
      maxPeerCount: 2,
      blockToLive: 0,
      memberOnlyRead: true,
      memberOnlyWrite: true,
    },
    overrides?.privateCols || {}
  );

  const privates = mspIds
    .map((mspId) =>
      privateCols.map((p) => {
        const {
          requiredPeerCount,
          maxPeerCount,
          blockToLive,
          memberOnlyRead,
          memberOnlyWrite,
        } = privateDefaults;
        return privateCollectionFor(
          mspId,
          p,
          requiredPeerCount,
          maxPeerCount,
          blockToLive,
          memberOnlyRead,
          memberOnlyWrite
        );
      })
    )
    .flat();

  const shared = sharedCols.map((p) => {
    const {
      requiredPeerCount,
      maxPeerCount,
      blockToLive,
      memberOnlyRead,
      memberOnlyWrite,
    } = sharedDefaults;
    return sharedCollectionFor(
      mspIds,
      p,
      requiredPeerCount,
      maxPeerCount,
      blockToLive,
      memberOnlyRead,
      memberOnlyWrite
    );
  });

  return [...privates, ...shared];
}
