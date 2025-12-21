import { IndexMetadata, OrderDirection } from "@decaf-ts/core";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { normalizeImport } from "../../shared/index";
import path from "path";

export type Index = {
  index: {
    fields: string[] | { [k: string]: OrderDirection };
  };
  ddoc?: string;
  name: string;
  type: "json";
};
//
// export type FabricCollection = {
//   name: "collectionMarbles";
//   policy: "OR('Org1MSP.member', 'Org2MSP.member')";
//   requiredPeerCount: 0;
//   maxPeerCount: 3;
//   blockToLive: 0;
//   memberOnlyRead: true;
//   memberOnlyWrite: true;
//   endorsementPolicy: {
//     identities: [
//       { role: { name: "member"; mspId: "Org1MSP" } },
//       { role: { name: "member"; mspId: "Org2MSP" } },
//     ];
//     rule: "OR('Org1MSP.member', 'Org2MSP.member')";
//   };
// };

export type FabricPolicyIdentity = {
  role: {
    name: string;
    mspId: string;
  };
};

export type FabricCollection = {
  name: string;
  policy: string;
  requiredPeerCount: number;
  maxPeerCount: number;
  blockToLive: number;
  memberOnlyRead: boolean;
  memberOnlyWrite: boolean;
  endorsementPolicy: {
    identities: FabricPolicyIdentity[];
    rule: string;
  };
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

export function generateModelCollections<M extends Model>(
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // // eslint-disable-next-line @typescript-eslint/no-require-imports
  // const path = require("path");

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
