describe("version module", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("registers version metadata on import", async () => {
    const registerLibrary = jest.fn();
    jest.doMock("@decaf-ts/decoration", () => ({
      __esModule: true,
      Metadata: { registerLibrary },
    }));

    const moduleExports = await import("../../src/version");
    const { Metadata } = await import("@decaf-ts/decoration");

    expect(moduleExports.VERSION).toBe("##VERSION##");
    expect(moduleExports.PACKAGE_NAME).toBe("##PACKAGE##");
    expect(Metadata.registerLibrary).toHaveBeenCalledWith(
      moduleExports.PACKAGE_NAME,
      moduleExports.VERSION
    );
  });
});
