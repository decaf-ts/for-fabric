module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "Node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          strict: false,
          noImplicitAny: false,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "/src/"],
  verbose: true,
  testRegex: "/tests/.*\\.(test|spec|setup)\\.(cjs|ts)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  transformIgnorePatterns: [
    "node_modules/(?!(before-after-hook|universal-user-agent|uuid|@kubernetes|openid-client|oauth4webapi|jose|query-string|@octokit|octokit|content-type|@noble/curves|@noble/hashes|@hyperledger/fabric-gateway)/)",
  ],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
