import fs from "fs";
import { Logging } from "@decaf-ts/logging";
import { rollup } from "rollup";
import typescript from "rollup-plugin-ts";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import path from "path";
import ts from "typescript"

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
          exclude: ["node_modules"]
        }),
      ],
    });

    await bundle.write({
      file: `${resolvePath(destinationDirectory)}/contract.js`,
      format: "umd",
      name: contractName,
      sourcemap: sourceMaps,
    });
  } catch (error) {
    log.error(`Error compiling TypeScript contract: ${error}`);
    throw error;
  }

}

export function compileStandaloneFile(filePath: string, outDir: string) {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    outDir,
    strict: true,
    skipLibCheck: true,
  };

  const host = ts.createCompilerHost(compilerOptions);
  host.writeFile = (fileName, content) => {
    const outputPath = path.join(outDir, path.basename(fileName));
    fs.writeFileSync(outputPath, content);
    console.log(`Written: ${outputPath}`);
  };

  const program = ts.createProgram([path.join(resolvePath(filePath))], compilerOptions, host);
  const emitResult = program.emit();

  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  diagnostics.forEach(diagnostic => {
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
      console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
  });

  const exitCode = emitResult.emitSkipped ? 1 : 0;
  console.log(`Process exited with code ${exitCode}`);
}