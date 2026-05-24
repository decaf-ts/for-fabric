import fs from "fs";
import os from "os";
import path from "path";
import { Model } from "@decaf-ts/decorator-validation";
import { readModelFolders } from "../../src/client/indexes";

describe("index generation folder resolution", () => {
  it("loads models from an absolute folder path", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-models-"));
    const modelFile = path.join(tmpDir, "TempModel.js");
    const decoratorValidationPath = path.join(
      process.cwd(),
      "node_modules",
      "@decaf-ts",
      "decorator-validation"
    );

    fs.writeFileSync(
      modelFile,
      [
        '"use strict";',
        `const { Model } = require(${JSON.stringify(
          decoratorValidationPath
        )});`,
        "class TempModel extends Model {}",
        "exports.TempModel = TempModel;",
        "",
      ].join("\n")
    );

    try {
      const models = await readModelFolders(tmpDir);

      expect(path.isAbsolute(tmpDir)).toBe(true);
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("TempModel");
      expect(new models[0]()).toBeInstanceOf(Model);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
