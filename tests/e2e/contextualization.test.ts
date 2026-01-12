// import {
//   BulkCrudOperationKeys,
//   OperationKeys,
//   version,
// } from "@decaf-ts/db-decorators";
// import {
//   maxlength,
//   minlength,
//   Model,
//   model,
//   type ModelArg,
//   required,
// } from "@decaf-ts/decorator-validation";
// import { Logging, LogLevel, MiniLogger } from "@decaf-ts/logging";
//
// Logging.setConfig({ level: LogLevel.silly, style: false });
//
// describe("Contextualization", () => {
//   let adapter: RamAdapter;
//
//   @table("tst_user")
//   @model()
//   class TestContextModel extends Model {
//     @pk()
//     id!: number;
//
//     @column("tst_name")
//     @required()
//     name!: string;
//
//     @column("tst_nif")
//     // @unique()
//     @minlength(9)
//     @maxlength(9)
//     @required()
//     nif!: string;
//
//     constructor(arg?: ModelArg<TestContextModel>) {
//       super(arg);
//     }
//   }
//
//   @table("tst_repo_user")
//   @model()
//   class TestContextRepoModel extends Model {
//     @pk()
//     id!: number;
//
//     @column("tst_name")
//     @required()
//     name!: string;
//
//     @column("tst_nif")
//     // @unique()
//     @minlength(9)
//     @maxlength(9)
//     @required()
//     nif!: string;
//
//     @column("tst_created_at")
//     @createdAt()
//     createdAt: Date;
//
//     @column("tst_version")
//     @version()
//     version!: number;
//
//     constructor(arg?: ModelArg<TestContextModel>) {
//       super(arg);
//     }
//   }
//
//   let repo: Repo<TestContextModel>;
//
//   const singleOps = [
//     OperationKeys.CREATE,
//     OperationKeys.READ,
//     OperationKeys.UPDATE,
//     OperationKeys.DELETE,
//   ];
//
//   const bulkOps = [
//     BulkCrudOperationKeys.CREATE_ALL,
//     BulkCrudOperationKeys.READ_ALL,
//     BulkCrudOperationKeys.UPDATE_ALL,
//     BulkCrudOperationKeys.DELETE_ALL,
//   ];
//
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   const transactionals = [
//     ...singleOps.filter((o) => o !== OperationKeys.READ),
//     ...bulkOps.filter((o) => o !== BulkCrudOperationKeys.READ_ALL),
//   ];
//
//   const crudOps = [...singleOps, ...bulkOps];
//   const allOps = [
//     OperationKeys.CREATE,
//     OperationKeys.READ,
//     OperationKeys.UPDATE,
//     OperationKeys.DELETE,
//     BulkCrudOperationKeys.CREATE_ALL,
//     BulkCrudOperationKeys.READ_ALL,
//     BulkCrudOperationKeys.UPDATE_ALL,
//     PersistenceKeys.STATEMENT,
//     PreparedStatementKeys.FIND_BY,
//     PreparedStatementKeys.FIND_ONE_BY,
//     PreparedStatementKeys.LIST_BY,
//     PreparedStatementKeys.PAGE_BY,
//     PersistenceKeys.QUERY,
//     BulkCrudOperationKeys.DELETE_ALL,
//   ];
//   const originalLog = MiniLogger.prototype["log"];
//
//   let logMock: any;
//   let consoleLogMock: any,
//     consoleErrorMock: any,
//     consoleWarnMock: any,
//     consoleDebugMock: any;
//
//   beforeAll(async () => {
//     adapter = new RamAdapter();
//     repo = Repository.forModel(TestContextRepoModel) as RamRepository<any>;
//   });
//
//   describe("adapter", () => {
//     const testModel = new TestContextModel({
//       id: Date.now(),
//       name: "name",
//       nif: "123456789",
//     });
//     const testModelList = new Array(10).fill(0).map(
//       (_, i) =>
//         new TestContextModel({
//           id: i,
//           name: "name" + i,
//           nif: "123456789",
//         })
//     );
//
//     let cached: TestContextModel = new TestContextModel({
//       id: Date.now(),
//       name: "name",
//       nif: "123456789",
//     });
//
//     let cachedBulk: TestContextModel[];
//
//     beforeEach(() => {
//       jest.clearAllMocks();
//       jest.resetAllMocks();
//       jest.resetAllMocks();
//       logMock = jest
//         .spyOn(MiniLogger.prototype, "log" as any)
//         .mockImplementation(function (this: any, ...args) {
//           return originalLog.call(this, ...args);
//         });
//       consoleLogMock = jest.spyOn(console, "log" as any);
//       consoleErrorMock = jest.spyOn(console, "error" as any);
//       consoleWarnMock = jest.spyOn(console, "warn" as any);
//       consoleDebugMock = jest.spyOn(console, "debug" as any);
//     });
//
//     crudOps
//       // .filter((c) => c === OperationKeys.CREATE)
//       .forEach((op) => {
//         it.skip(`Should always expect a context for ${op} operation`, async () => {
//           await expect(adapter[op](testModel)).rejects.toThrow(
//             "No context provided"
//           );
//         });
//
//         it(`Should execute ${op} with a context`, async () => {
//           const { ctx, log } = await adapter["logCtx"](
//             [TestContextModel],
//             op,
//             true,
//             { test: "TEST", correlationId: "CORREL" } as any
//           );
//
//           const ctxLog = log["context"];
//           expect(ctxLog).toEqual(expect.arrayContaining(["ram adapter"]));
//
//           let m: TestContextModel | number | number[] | TestContextModel[];
//           let args: any[] = [];
//           switch (op) {
//             case OperationKeys.CREATE:
//               m = new TestContextModel(cached);
//               args = [m[Model.pk(TestContextModel)], m];
//               break;
//             case OperationKeys.UPDATE:
//               m = new TestContextModel({ ...cached, name: "updated" });
//               args = [m[Model.pk(TestContextModel)], m];
//               break;
//             case BulkCrudOperationKeys.CREATE_ALL:
//               m = testModelList;
//               args = [m.map((m) => m[Model.pk(TestContextModel)]), m];
//               break;
//             case BulkCrudOperationKeys.UPDATE_ALL:
//               m = cachedBulk.map(
//                 (m) => new TestContextModel({ ...m, name: "updated" })
//               );
//               args = [cachedBulk.map((m) => m[Model.pk(TestContextModel)]), m];
//               break;
//             case BulkCrudOperationKeys.READ_ALL:
//               m = cachedBulk;
//               args = [m.map((m) => m[Model.pk(TestContextModel)])];
//               break;
//             case BulkCrudOperationKeys.DELETE_ALL:
//               args = [cachedBulk.map((m) => m[Model.pk(TestContextModel)])];
//               break;
//             default:
//               m = cached;
//               args = [m[Model.pk(TestContextModel)]];
//           }
//
//           const current = await adapter[op](TestContextModel, ...args, ctx);
//
//           switch (op) {
//             case OperationKeys.CREATE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextModel);
//               expect(current.hasErrors()).toBeUndefined();
//               expect(logMock).toHaveBeenCalledTimes(2);
//               expect(logMock).toHaveBeenNthCalledWith(
//                 1,
//                 "silly",
//                 expect.stringMatching(
//                   `creating new context for ${op} operation on ${Model.tableName(TestContextModel)}`
//                 )
//               );
//               expect(logMock).toHaveBeenNthCalledWith(
//                 2,
//                 "debug",
//                 expect.stringMatching(
//                   `creating record in table ${Model.tableName(TestContextModel)} with id ${current[Model.pk(TestContextModel)]}`
//                 )
//               );
//
//               expect(consoleLogMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenCalledTimes(2);
//               expect(consoleErrorMock).toHaveBeenCalledTimes(0);
//               expect(consoleWarnMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 1,
//                 expect.stringMatching(
//                   /SILLY \[.*?\] ram adapter\.context - creating new context/g
//                 )
//               );
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 2,
//                 expect.stringMatching(
//                   /DEBUG \[.*?\] ram adapter\.create - creating record in table/g
//                 )
//               );
//               break;
//             case OperationKeys.READ:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextModel);
//               expect(current.hasErrors()).toBeUndefined();
//               expect(current.equals(cached)).toBe(true);
//               expect(logMock).toHaveBeenCalledTimes(2);
//               expect(logMock).toHaveBeenNthCalledWith(
//                 1,
//                 "silly",
//                 expect.stringMatching(
//                   `creating new context for ${op} operation on ${Model.tableName(TestContextModel)}`
//                 )
//               );
//               expect(logMock).toHaveBeenNthCalledWith(
//                 2,
//                 "debug",
//                 expect.stringMatching(
//                   `reading record in table ${Model.tableName(TestContextModel)} with id ${current[Model.pk(TestContextModel)]}`
//                 )
//               );
//
//               expect(consoleLogMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenCalledTimes(2);
//               expect(consoleErrorMock).toHaveBeenCalledTimes(0);
//               expect(consoleWarnMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 1,
//                 expect.stringMatching(
//                   /SILLY \[.*?\] ram adapter\.context - creating new context/g
//                 )
//               );
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 2,
//                 expect.stringMatching(
//                   /DEBUG \[.*?\] ram adapter\.read - reading record in table/g
//                 )
//               );
//               break;
//             case OperationKeys.UPDATE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextModel);
//               expect(current.equals(cached)).toBe(false);
//               expect(logMock).toHaveBeenCalledTimes(2);
//               expect(logMock).toHaveBeenNthCalledWith(
//                 1,
//                 "silly",
//                 expect.stringMatching(
//                   `creating new context for ${op} operation on ${Model.tableName(TestContextModel)}`
//                 )
//               );
//               expect(logMock).toHaveBeenNthCalledWith(
//                 2,
//                 "debug",
//                 expect.stringMatching(
//                   `updating record in table ${Model.tableName(TestContextModel)} with id ${current[Model.pk(TestContextModel)]}`
//                 )
//               );
//
//               expect(consoleLogMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenCalledTimes(2);
//               expect(consoleErrorMock).toHaveBeenCalledTimes(0);
//               expect(consoleWarnMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 1,
//                 expect.stringMatching(
//                   /SILLY \[.*?\] ram adapter\.context - creating new context/g
//                 )
//               );
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 2,
//                 expect.stringMatching(
//                   /DEBUG \[.*?\] ram adapter\.update - updating record in table/g
//                 )
//               );
//               break;
//             case OperationKeys.DELETE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextModel);
//               expect(current.hasErrors()).toBeUndefined();
//               expect(current.equals(cached)).toBe(true);
//               expect(logMock).toHaveBeenCalledTimes(2);
//               expect(logMock).toHaveBeenNthCalledWith(
//                 1,
//                 "silly",
//                 expect.stringMatching(
//                   `creating new context for ${op} operation on ${Model.tableName(TestContextModel)}`
//                 )
//               );
//               expect(logMock).toHaveBeenNthCalledWith(
//                 2,
//                 "debug",
//                 expect.stringMatching(
//                   `deleting record from table ${Model.tableName(TestContextModel)} with id ${current[Model.pk(TestContextModel)]}`
//                 )
//               );
//
//               expect(consoleLogMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenCalledTimes(2);
//               expect(consoleErrorMock).toHaveBeenCalledTimes(0);
//               expect(consoleWarnMock).toHaveBeenCalledTimes(0);
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 1,
//                 expect.stringMatching(
//                   /SILLY \[.*?\] ram adapter\.context - creating new context/g
//                 )
//               );
//               expect(consoleDebugMock).toHaveBeenNthCalledWith(
//                 2,
//                 expect.stringMatching(
//                   /DEBUG \[.*?\] ram adapter\.delete - deleting record from table/g
//                 )
//               );
//               break;
//             case BulkCrudOperationKeys.UPDATE_ALL:
//             case BulkCrudOperationKeys.CREATE_ALL:
//             case BulkCrudOperationKeys.READ_ALL:
//             case BulkCrudOperationKeys.DELETE_ALL:
//               expect(current).toBeDefined();
//               expect(
//                 current.every(
//                   (c) => c instanceof TestContextModel && !c.hasErrors()
//                 )
//               ).toBeTruthy();
//               break;
//             default:
//               expect(
//                 Array.isArray(current)
//                   ? current.find((c) => c.hasErrors())
//                   : current.hasErrors()
//               ).toBeUndefined();
//               break;
//           }
//
//           if (bulkOps.includes(op as any)) {
//             cachedBulk = current;
//           } else {
//             cached = current;
//           }
//         });
//       });
//   });
//
//   describe("repository", () => {
//     let observer: Observer;
//     let mock: any;
//
//     beforeEach(() => {
//       mock = jest.fn();
//       observer = new (class implements Observer {
//         refresh(...args: any[]): Promise<void> {
//           return mock(...args);
//         }
//       })();
//       repo.observe(observer);
//
//       jest.clearAllMocks();
//       jest.restoreAllMocks();
//       jest.resetAllMocks();
//       logMock = jest
//         .spyOn(MiniLogger.prototype, "log" as any)
//         .mockImplementation(function (this: any, ...args) {
//           return originalLog.call(this, ...args);
//         });
//       consoleLogMock = jest.spyOn(console, "log" as any);
//       consoleErrorMock = jest.spyOn(console, "error" as any);
//       consoleWarnMock = jest.spyOn(console, "warn" as any);
//       consoleDebugMock = jest.spyOn(console, "debug" as any);
//     });
//
//     afterEach(() => {
//       repo.unObserve(observer);
//     });
//
//     const testModelList = new Array(10).fill(0).map(
//       (_, i) =>
//         new TestContextRepoModel({
//           name: "name" + i,
//           nif: "123456789",
//         })
//     );
//
//     let cached: TestContextRepoModel = new TestContextRepoModel({
//       name: "name",
//       nif: "123456789",
//     });
//
//     let cachedBulk: TestContextRepoModel[];
//
//     allOps
//       // .filter((_, i) => i === 0)
//       .forEach((op) => {
//         it(`Should execute ${op} without being provided a context`, async () => {
//           let m:
//             | TestContextRepoModel
//             | number
//             | number[]
//             | TestContextRepoModel[]
//             | any;
//           let args: any[] = [];
//           switch (op) {
//             case OperationKeys.CREATE:
//               m = new TestContextRepoModel(cached);
//               break;
//             case OperationKeys.READ:
//             case OperationKeys.DELETE:
//               m = cached[Model.pk(TestContextRepoModel)];
//               break;
//             case OperationKeys.UPDATE:
//               m = new TestContextRepoModel({ ...cached, name: "updated" });
//               break;
//             case BulkCrudOperationKeys.CREATE_ALL:
//               m = testModelList;
//               args = [];
//               break;
//             case BulkCrudOperationKeys.UPDATE_ALL:
//               m = cachedBulk.map(
//                 (m) => new TestContextRepoModel({ ...m, nif: "987654321" })
//               );
//               args = [];
//               break;
//             case BulkCrudOperationKeys.READ_ALL:
//             case BulkCrudOperationKeys.DELETE_ALL:
//               m = cachedBulk.map((m) => m[Model.pk(TestContextModel)]);
//               args = [];
//               break;
//             case PreparedStatementKeys.FIND_BY:
//               m = "name";
//               args = ["name2"];
//               break;
//             case PreparedStatementKeys.PAGE_BY:
//               m = "name";
//               args = [OrderDirection.DSC, { limit: 3, offset: 1 }];
//               break;
//             case PreparedStatementKeys.LIST_BY:
//               m = "id";
//               args = [OrderDirection.DSC];
//               break;
//             case PreparedStatementKeys.FIND_ONE_BY:
//               m = "name";
//               args = ["name2"];
//               break;
//             case PersistenceKeys.STATEMENT:
//               m = PreparedStatementKeys.FIND_BY;
//               args = ["name", "name5"];
//               break;
//             case PersistenceKeys.QUERY:
//               m = Condition.attr<TestContextRepoModel>("createdAt")
//                 .lt(new Date())
//                 .and(Condition.attr<TestContextRepoModel>("version").gte(1));
//               args = ["version", OrderDirection.DSC, 2, 2];
//               break;
//             default:
//               m = cached;
//               args = [];
//           }
//
//           let current = await repo[op](m, ...args);
//
//           switch (op) {
//             case OperationKeys.CREATE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextRepoModel);
//               expect(current.hasErrors()).toBeUndefined();
//               //
//               // expect(logMock).toHaveBeenCalledTimes(32);
//               // expect(logMock.mock.calls.flat().join("\n")).toEqual(``);
//               // expect(consoleLogMock).toHaveBeenCalledTimes(0);
//               // expect(consoleDebugMock).toHaveBeenCalledTimes(2);
//               // expect(consoleErrorMock).toHaveBeenCalledTimes(0);
//               // expect(consoleWarnMock).toHaveBeenCalledTimes(0);
//
//               break;
//             case OperationKeys.READ:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextRepoModel);
//               expect(current.hasErrors()).toBeUndefined();
//               expect(current.equals(cached)).toBe(true);
//               break;
//             case OperationKeys.UPDATE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextRepoModel);
//               expect(current.equals(cached)).toBe(false);
//               break;
//             case OperationKeys.DELETE:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextRepoModel);
//               expect(current.hasErrors()).toBeUndefined();
//               expect(current.equals(cached)).toBe(true);
//               break;
//             case BulkCrudOperationKeys.UPDATE_ALL:
//             case BulkCrudOperationKeys.CREATE_ALL:
//             case BulkCrudOperationKeys.READ_ALL:
//             case BulkCrudOperationKeys.DELETE_ALL:
//               expect(current).toBeDefined();
//               expect(
//                 current.every(
//                   (c) => c instanceof TestContextRepoModel && !c.hasErrors()
//                 )
//               ).toBeTruthy();
//               break;
//             case PreparedStatementKeys.FIND_BY:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Array);
//               expect(current.length).toBe(1);
//               expect(current[0].equals(cachedBulk[2])).toBe(true);
//               break;
//             case PreparedStatementKeys.PAGE_BY:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Object);
//               expect(current).toEqual(
//                 expect.objectContaining({
//                   bookmark: 9,
//                   count: 10,
//                   current: 1,
//                   data: cachedBulk.slice(cachedBulk.length - 3).reverse(),
//                 })
//               );
//               current = await repo.paginateBy("name", OrderDirection.DSC, {
//                 limit: 3,
//                 offset: 2,
//                 bookmark: current.bookmark,
//               });
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Object);
//               expect(current).toEqual(
//                 expect.objectContaining({
//                   bookmark: 6,
//                   count: 10,
//                   current: 2,
//                   total: 4,
//                   data: cachedBulk
//                     .slice(cachedBulk.length - 6, cachedBulk.length - 3)
//                     .reverse(),
//                 })
//               );
//               break;
//             case PreparedStatementKeys.LIST_BY:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Array);
//               expect(current.length).toBe(10);
//               expect(
//                 current.reverse().every((e, i) => e.equals(cachedBulk[i]))
//               ).toBe(true);
//               break;
//             case PreparedStatementKeys.FIND_ONE_BY:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(TestContextRepoModel);
//               expect(current.equals(cachedBulk[2])).toBe(true);
//               break;
//             case PersistenceKeys.STATEMENT:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Array);
//               expect(current.length).toBe(1);
//               expect(
//                 current[0].equals(cachedBulk[cachedBulk.length - (4 + 1)])
//               ).toBe(true);
//               break;
//             case PersistenceKeys.QUERY:
//               expect(current).toBeDefined();
//               expect(current).toBeInstanceOf(Array);
//               expect(current.length).toBe(0);
//               break;
//             default:
//               expect(
//                 Array.isArray(current)
//                   ? current.find((c) => c.hasErrors())
//                   : current.hasErrors()
//               ).toBeUndefined();
//               break;
//           }
//
//           if (bulkOps.includes(op as any)) {
//             cachedBulk = current;
//           } else if (crudOps.includes(op as any)) {
//             cached = current;
//           }
//         });
//       });
//   });
// });
