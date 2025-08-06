import fs from "fs";
import { Logging } from "@decaf-ts/logging";
import { rollup } from "rollup";
import typescript from "rollup-plugin-ts";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import path from "path";

export function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);
}
export async function compileContract(
  contractDirectory: string,
  contractName: string,
  version: string,
  tsConfigFile: string,
  destinationDirectory: string,
  sourceMaps: boolean = false
) {
  const log = Logging.for(compileContract);

  log.info(`Compiling TypeScript contract ${contractName}`);

  try {
    const bundle = await rollup({
      input: `${resolvePath(contractDirectory)}/${contractName}.ts`,
      plugins: [
        resolve({ preferBuiltins: true }),
        commonjs(),
        json(),
        typescript({
          tsconfig: tsConfigFile,
          transpiler: "typescript",
          transpileOnly: true,
        }),
      ],
    });

    bundle.write({
      file: `${resolvePath(destinationDirectory)}/${contractName}.js`,
      format: "umd",
      name: contractName,
      sourcemap: sourceMaps,
    });
  } catch (error) {
    log.error(`Error compiling TypeScript contract: ${error}`);
    throw error;
  }

}