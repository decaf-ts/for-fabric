import "../../src/shared/overrides";
import fs from "fs";
import os from "os";
import path from "path";
import {
  BaseModel,
  defaultQueryAttr,
  index,
  OrderDirection,
  pk,
  table,
  view,
} from "@decaf-ts/core";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { count, CouchDBDesignDoc } from "@decaf-ts/for-couchdb";
import { FabricFlavour } from "../../src/shared/constants";
import {
  generateModelDesignDocs,
  generateModelIndexes,
  writeDesignDocs,
  writeIndexes,
} from "../../src/client/indexes";
import type { Logger } from "@decaf-ts/logging";

Model.setBuilder(Model.fromModel);

const verboseLogger = {
  verbose: jest.fn(),
  for: jest.fn().mockReturnThis(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  silly: jest.fn(),
  clear: jest.fn(),
} as unknown as Logger;

@uses(FabricFlavour)
@table("fabric_view_model")
@model()
class FabricViewModel extends BaseModel {
  @pk({ type: String })
  id!: string;

  @required()
  @view({ name: "by_status", ddoc: "view_ddoc" })
  @count({ name: "count_status", ddoc: "agg_ddoc" })
  status!: string;

  @required()
  @index([OrderDirection.ASC])
  value!: number;

  constructor(arg?: ModelArg<FabricViewModel>) {
    super(arg);
  }
}

@table("fabric_default_query_model")
@model()
class FabricDefaultQueryModel extends BaseModel {
  @pk({ type: String })
  code!: string;

  @defaultQueryAttr()
  @index([OrderDirection.ASC])
  model!: string;

  constructor(arg?: ModelArg<FabricDefaultQueryModel>) {
    super(arg);
  }
}

@table("fabric_no_pk_model")
@model()
class FabricNoPkModel extends BaseModel {
  @defaultQueryAttr()
  name!: string;

  constructor(arg?: ModelArg<FabricNoPkModel>) {
    super(arg);
  }
}

describe("index generation utilities", () => {
  it("generates indexes and design docs for decorated models", () => {
    const indexes = generateModelIndexes(FabricViewModel, verboseLogger);
    expect(indexes.length).toBeGreaterThan(0);
    expect(
      indexes.some(
        (index) => index.name === "fabric_view_model_id_asc_index"
      )
    ).toBe(true);
    expect(
      indexes.some(
        (index) => index.name === "fabric_view_model_id_desc_index"
      )
    ).toBe(true);

    const accumulator: Record<string, CouchDBDesignDoc> = {};
    const designDocs = generateModelDesignDocs(FabricViewModel, accumulator);
    expect(designDocs.length).toBeGreaterThan(0);
    expect(Object.keys(accumulator)).toHaveLength(designDocs.length);
    expect(
      designDocs.every((doc) => typeof doc._id === "string" && doc._id.startsWith("_design/"))
    ).toBe(true);
  });

  it("writes indexes and design docs to META-INF structure", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-indexes-"));
    const indexes = generateModelIndexes(FabricViewModel, verboseLogger);
    const designDocs = generateModelDesignDocs(FabricViewModel);

    writeIndexes(indexes, tmpDir);
    writeDesignDocs(designDocs, tmpDir);

    const indexDir = path.join(
      tmpDir,
      "META-INF",
      "statedb",
      "couchdb",
      "indexes"
    );
    const designDir = path.join(
      tmpDir,
      "META-INF",
      "statedb",
      "couchdb",
      "design_docs"
    );

    expect(fs.existsSync(indexDir)).toBe(true);
    expect(fs.readdirSync(indexDir).length).toBeGreaterThan(0);
    expect(fs.existsSync(designDir)).toBe(true);
    const designFiles = fs.readdirSync(designDir);
    expect(designFiles.length).toBeGreaterThan(0);

    const storedDoc = JSON.parse(
      fs.readFileSync(path.join(designDir, designFiles[0]), "utf-8")
    );
    expect(storedDoc._id).toBeDefined();
    expect(storedDoc._rev).toBeUndefined();
    expect(storedDoc.views).toBeDefined();
  });

  it("includes the model pk as a tie-breaker in sorted default query indexes", () => {
    const indexes = generateModelIndexes(FabricDefaultQueryModel, verboseLogger);
    const defaultQueryAsc = indexes.find(
      (index) => index.name === "fabric_default_query_model_model_defaultQuery_asc_index"
    );
    const defaultQueryDsc = indexes.find(
      (index) => index.name === "fabric_default_query_model_model_defaultQuery_desc_index"
    );

    expect(defaultQueryAsc).toBeDefined();
    expect(defaultQueryDsc).toBeDefined();
    expect((defaultQueryAsc as any).index.fields).toEqual([
      { "??table": "asc" },
      { model: "asc" },
      { code: "asc" },
    ]);
    expect((defaultQueryDsc as any).index.fields).toEqual([
      { "??table": "desc" },
      { model: "desc" },
      { code: "desc" },
    ]);
  });

  it("skips default query pk tie-breakers for models without a pk", () => {
    const log = { verbose: jest.fn() };
    const indexes = generateModelIndexes(FabricNoPkModel, log);

    expect(indexes.length).toBeGreaterThan(0);
    expect(log.verbose).toHaveBeenCalledWith(
      expect.stringContaining("Skipping FabricNoPkModel while extracting indexes")
    );
    expect(
      indexes.some((index) =>
        String(index.name || "").includes("defaultQuery")
      )
    ).toBe(true);
  });
});
