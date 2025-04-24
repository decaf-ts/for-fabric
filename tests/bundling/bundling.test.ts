import { Dirent } from "fs";
import path from "path";

describe("Distribution Tests", () => {
  it("reads lib", () => {
    const { VERSION } = require("../../lib/index.cjs");
    expect(VERSION).toBeDefined();
  });

  it("reads JS Bundle", () => {
    try {
      let distFile: Dirent[];
      try {
        distFile = require("fs")
          .readdirSync(path.join(__dirname, "../../dist"), {
            withFileTypes: true,
          })
          .filter((d: Dirent) => d.isFile() && !d.name.endsWith("esm.js"));
      } catch (e: unknown) {
        throw new Error("Error reading JS bundle: " + e);
      }

      if (distFile.length === 0)
        throw new Error("There should only be a js file in directory");
      const { VERSION } = require(`../../dist/${distFile[0].name}`);
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });
});
