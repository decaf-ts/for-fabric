describe("for-fabric root index exports", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("re-exports version metadata constants", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rootExports = require("../../src");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const versionExports = require("../../src/version");

    expect(rootExports.VERSION).toBe(versionExports.VERSION);
    expect(rootExports.PACKAGE_NAME).toBe(versionExports.PACKAGE_NAME);
  });

  it("re-exports shared helpers", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rootExports = require("../../src");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateFabricEventName } = require("../../src/shared/events");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CoreUtils } = require("../../src/shared/utils");

    expect(rootExports.generateFabricEventName).toBe(generateFabricEventName);
    expect(rootExports.CoreUtils).toBe(CoreUtils);
  });
});
