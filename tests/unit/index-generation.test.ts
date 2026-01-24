import "../../src/shared/overrides";
import fs from "fs";
import os from "os";
import path from "path";
import {
  BaseModel,
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

Model.setBuilder(Model.fromModel);

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

describe("index generation utilities", () => {
  it("generates indexes and design docs for decorated models", () => {
    const indexes = generateModelIndexes(FabricViewModel);
    expect(indexes.length).toBeGreaterThan(0);

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
    const indexes = generateModelIndexes(FabricViewModel);
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
});
