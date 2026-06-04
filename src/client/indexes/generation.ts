import { Constructor } from "@decaf-ts/decoration";
import {
  CreateIndexRequest,
  CouchDBDesignDoc,
  generateIndexes,
  generateViews,
} from "@decaf-ts/for-couchdb";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";

export type Index = CreateIndexRequest;

function ensureDirectoryExistence(filePath: string) {
  const fs = require("fs");
  const path = require("path");
  const dirname: string = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

export function generateModelIndexes<M extends Model>(
  m: Constructor<M>
): Index[] {
  return generateIndexes([m]);
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
  const path = require("path");
  const filePath = path.resolve(file.parentPath, file.name);
  const exports = require(filePath);

  const values = Object.values(exports).filter((e) => {
    try {
      const m = new (e as Constructor)();
      return m instanceof Model;
    } catch {
      return false;
    }
  }) as ModelConstructor<any>[];
  return values;
}

export async function readModelFolders(
  ...folders: string[]
): Promise<ModelConstructor<any>[]> {
  const fs = require("fs");
  const path = require("path");

  const result: ModelConstructor<any>[] = [];

  for (const folder of folders) {
    const resolvedFolder = path.resolve(folder);
    const files = fs
      .readdirSync(resolvedFolder, {
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
  const fs = require("fs");
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
  const fs = require("fs");
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
