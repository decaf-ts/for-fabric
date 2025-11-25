import "reflect-metadata";

import { LoggedClass, Logging } from "@decaf-ts/logging";

class ExampleService extends LoggedClass {
  public getInstanceLogger() {
    return this.log;
  }

  public static acquireStaticLogger() {
    return this.log;
  }
}

describe("LoggedService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("memoizes instance logger lookups", () => {
    const forSpy = jest
      .spyOn(Logging, "for")
      .mockReturnValue({ for: jest.fn() } as any);

    const service = new ExampleService();
    const loggerA = service.getInstanceLogger();
    const loggerB = service.getInstanceLogger();

    expect(loggerA).toBe(loggerB);
    expect(forSpy).toHaveBeenCalledTimes(1);
  });

  it("memoizes static logger lookups", () => {
    const loggerA = ExampleService.acquireStaticLogger();
    const loggerB = ExampleService.acquireStaticLogger();

    expect(loggerA).toBe(loggerB);
  });
});
