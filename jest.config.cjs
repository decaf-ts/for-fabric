// import { Config } from "@jest/types";

const config = {
  verbose: true,
  rootDir: __dirname,
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.tests.json" }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(?:@noble/curves|@noble/hashes|@hyperledger/fabric-gateway)/)",
  ],
  setupFiles: ["<rootDir>/tests/bootstrap.ts"],
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(test|spec)\\.(ts|tsx)$",
  watchman: false,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testPathIgnorePatterns: ["/src/bin"],
  collectCoverage: false,
  coverageDirectory: "./workdocs/reports/coverage",
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/bin/**/*",
    "!src/contract/**/*",
  ],
  reporters: ["default"],
};

module.exports = config;
