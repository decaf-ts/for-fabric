import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");

const TRACKED_MODELS_FOLDER = path.join(
  ROOT,
  "lib",
  "cjs",
  "contract",
  "trackedModels"
);

const DECAF_CLI = path.join(
  ROOT,
  "node_modules",
  "@decaf-ts",
  "cli",
  "lib",
  "cjs",
  "bin",
  "cli.cjs"
);

const EXPECTED_CONFIG_PATH = path.join(
  ROOT,
  "tests",
  "assets",
  "expected-collections-config.json"
);

function sortByCollectionName(
  cols: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return [...cols].sort((a, b) =>
    String(a["name"]).localeCompare(String(b["name"]))
  );
}

describe("normal usage", () => {
  it(
    "builds the package, extracts collections and compares against the expected result",
    () => {
      // 1. build the package so lib/cjs is up to date with the source
      execSync("npm run build", {
        cwd: ROOT,
        stdio: "pipe",
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
      });

      const trackedModelsFolder = path.join(
        ROOT,
        "lib",
        "cjs",
        "contract",
        "trackedModels"
      );
      expect(fs.existsSync(trackedModelsFolder)).toBe(true);

      const outDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "decaf-fabric-extract-collections-")
      );

      try {
        // 2. run the extract-collections command against the compiled models
        execFileSync(
          process.execPath,
          [
            DECAF_CLI,
            "fabric",
            "extract-collections",
            `--folder`,
            trackedModelsFolder,
            `--outDir`,
            outDir,
            `--mspIds`,
            '["orgb","orgc"]',
            `--mainMspId`,
            "orga",
          ],
          {
            cwd: ROOT,
            stdio: "pipe",
            encoding: "utf-8",
          }
        );

        // 3. read the generated collections file
        const generatedPath = path.join(
          outDir,
          "META-INF",
          "collections_config.json"
        );
        expect(fs.existsSync(generatedPath)).toBe(true);
        const generated = JSON.parse(
          fs.readFileSync(generatedPath, "utf-8")
        ) as Array<Record<string, unknown>>;

        // 4. compare against the expected results
        const expected = JSON.parse(
          fs.readFileSync(EXPECTED_CONFIG_PATH, "utf-8")
        ) as Array<Record<string, unknown>>;

        expect(sortByCollectionName(generated)).toEqual(
          sortByCollectionName(expected)
        );
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000
  );
});
