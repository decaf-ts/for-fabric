import { IndexMetadata, OrderDirection } from "@decaf-ts/core";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  CouchDBDesignDoc,
  CouchDBKeys,
  generateViews,
} from "@decaf-ts/for-couchdb";
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
  const tableField = fields.pop();
  if (tableField && tableField !== CouchDBKeys.TABLE) {
    fields.push(tableField);
  } else if (tableField === CouchDBKeys.TABLE) {
    fields.unshift(tableField);
  }

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

function ensureDirectoryExistence(filePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  const dirname: string = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
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

export function generateModelDesignDocs<M extends Model>(
  m: Constructor<M>,
  accum?: Record<string, CouchDBDesignDoc>
): CouchDBDesignDoc[] {
  const views = generateViews([m]);
  const storage: Record<string, CouchDBDesignDoc> = accum || {};
  views.forEach((doc) => {
    storage[doc._id] = doc;
  });
  return views;
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

export function writeIndexes(
  indexes: Index[],
  p: string = process.cwd(),
  collection?: string
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  indexes.forEach((index) => {
    const file = path.resolve(
      path.join(
        p,
        `./META-INF/statedb/couchdb/${collection ? `collections/${collection}/` : ""}indexes/${index.name}.json`
      )
    );
    ensureDirectoryExistence(file);
    fs.writeFileSync(file, JSON.stringify(index, undefined, 2));
  });
}

export function writeDesignDocs(
  designDocs: CouchDBDesignDoc[],
  p: string = process.cwd(),
  collection?: string
) {
  if (!designDocs.length) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  designDocs.forEach((doc) => {
    const docId = doc._id.replace(/^_design\//, "");
    const file = path.resolve(
      path.join(
        p,
        `./META-INF/statedb/couchdb/${collection ? `collections/${collection}/` : ""}design_docs/${docId}.json`
      )
    );
    ensureDirectoryExistence(file);
    const payload = { ...doc };
    delete payload._rev;
    fs.writeFileSync(file, JSON.stringify(payload, undefined, 2));
  });
}
