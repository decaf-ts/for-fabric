import path from "path";
import { Command } from "commander";
import { InternalError } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import {
  generateModelIndexes,
  readModelFile,
  readModelFolders,
  writeIndexes,
} from "../client/indexes/index";
import { Logging } from "@decaf-ts/logging";
const program = new Command();

program
  .command("compile-indexes")
  .option("--file [String]", "the model file")
  .option("--folder [String]", "the model folder")
  .option("--outDir <String>", "the outdir. should match your contract folder")
  .description(
    "Creates a the JSON index files to be submitted to along with the contract"
  )
  .action(async (options: any) => {
    // eslint-disable-next-line prefer-const
    let { file, folder, outDir } = options;
    const log = Logging.get();

    const models: any[] = [];
    if (file) {
      models.push(...readModelFile(file));
    }

    if (folder) {
      log.info(`Loading models from ${folder}...`);
      models.push(...(await readModelFolders(folder)));
    }
    const result: Record<string, any> = {};

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    for (const m of models) {
      log.verbose(`Extracting indexes for table ${Model.tableName(m)}`);
      generateModelIndexes(m, result);
    }
    log.verbose(`Found ${Object.keys(result).length} indexes to create`);
    log.debug(`Indexes: ${JSON.stringify(result)}`);
    writeIndexes(Object.values(result), outDir);
  });

program.parse(process.argv);
