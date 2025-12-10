import path from "path";
import { Command } from "commander";
import { InternalError } from "@decaf-ts/db-decorators";
import { FabricClientAdapter } from "../client/index";
const program = new Command();

program
  .command("compile-indexes")
  .description(
    "Creates a the JSON index files to be submitted to along with the contract"
  )
  .option("--file", "path to the Model Class file", false)
  .option("--folder", "path to the folder with Model Class Files", false)
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "makes attaching debugger possible", false)
  .action(async (options: any) => {
    // eslint-disable-next-line prefer-const
    let { file, folder } = options;

    if (file) {
      folder = path.dirname(file);
    }

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    const adapter = new FabricClientAdapter({} as any);
    await adapter["index"](folder);
  });

program.parse(process.argv);
