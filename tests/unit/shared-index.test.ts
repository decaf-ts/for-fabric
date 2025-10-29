describe("shared module index exports", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("re-exports event utilities and constants", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const shared = require("../../src/shared");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const events = require("../../src/shared/events");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const constants = require("../../src/shared/constants");

    expect(shared.generateFabricEventName).toBe(events.generateFabricEventName);
    expect(shared.parseEventName).toBe(events.parseEventName);
    expect(shared.FabricFlavour).toBe(constants.FabricFlavour);
    expect(shared.IdentityType).toBe(constants.IdentityType);
  });

  it("re-exports utility classes", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const shared = require("../../src/shared");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const utils = require("../../src/shared/utils");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const decorated = require("../../src/shared/decorators");

    expect(shared.CoreUtils).toBe(utils.CoreUtils);
    expect(shared.Owner).toBe(decorated.Owner);
    expect(shared.privateData).toBe(decorated.privateData);
  });
});
