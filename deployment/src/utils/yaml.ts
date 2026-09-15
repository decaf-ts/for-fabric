import fs from "fs";

export function copyAndOverrideYaml(
  originPath: string,
  destPath: string,
  replacements: { [x: string]: string }
) {
  try {
    let data = fs.readFileSync(originPath, "utf-8");

    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = new RegExp(`\\$\\{${key}\\}`, "g"); // This assumes variables are in the format ${variable}
      if (value !== undefined) data = data.replace(placeholder, value);
    }

    fs.writeFileSync(destPath, data, "utf-8");
  } catch (e: unknown) {
    console.log(e);
    process.exit(1);
  }
}
