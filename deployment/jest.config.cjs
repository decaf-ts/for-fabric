module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.[tj]sx?$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          ["@babel/preset-typescript", { allowDeclareFields: true }],
        ],
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "/src/"],
  verbose: true,
  extensionsToTreatAsEsm: [".ts"],
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
