import { Model, ModelArg, required } from "@decaf-ts/decorator-validation";
import {
  FabricModelKeys,
  getFabricModelKey,
  getPrivateDataMetadata,
  privateData,
} from "../../src/shared";

jest.setTimeout(5000000);

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  trace: jest.fn(),
  log: jest.fn(),
};
const state: Record<string, any> = {};

const ctx = {
  stub: {
    getMspID: () => {
      return "Aeon";
    },
    setEvent: (name: string, payload: any): void => {
      console.info(
        `Event "${name}" triggered with payload of length ${payload.length}`
      );
    },
    getDateTimestamp: () => {
      return new Date();
    },
    createCompositeKey: (objectType: string, attributes: string[]) => {
      return objectType + "_" + attributes.join("_");
    },
    getState: async (key: string) => {
      if (key in state) return state[key];
      return "";
    },
    putState: async (key: string, value: any) => {
      state[key] = value;
    },
    deleteState: async (key: string) => {
      if (key in state) {
        delete state[key];
        return;
      }
      throw new Error("Missing");
    },
    getQueryResultWithPagination: async (
      query: string,
      pageSize: number,
      bookmark: string
    ) => {
      const keys = Object.keys(state);

      let startIndex = 0;
      if (bookmark) {
        const index = keys.indexOf(bookmark);
        startIndex = index >= 0 ? index + 1 : 0;
      }

      const paginatedKeys = keys.slice(startIndex, startIndex + pageSize);
      let currentIndex = 0;

      return {
        iterator: {
          async next() {
            if (currentIndex < paginatedKeys.length) {
              const key = paginatedKeys[currentIndex++];
              return {
                value: { key, value: state[key] },
                done: false,
              };
            }
            return { done: true };
          },
          async close() {
            // No-op for mock
          },
        },
      };
    },
  },
  logging: {
    getLogger: (_str: string) => {
      console.log(_str);
      return logger;
    },
  },
  identity: {
    getID: () => "id",
    getMSPID: () => "Aeon",
  },
  logger: {
    ...logger,
  },
};

const ORGA = "OrganizationA";
const ORGB = "OrganizationB";

describe("Tests private data decorator", () => {
  it("Tests private data decorator on property", () => {
    class TestPrivateData1 extends Model {
      @required()
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData1({ name: "John Doe" });

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c,
      "name"
    );
    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(1);
    expect(propMetadata.collections[0]).toBe(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData1
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests private data decorator on class", () => {
    @privateData(ORGB)
    class TestPrivateData2 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData2
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(1);
    expect(modelMetadata.collections[0]).toEqual(ORGB);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests multiple private data decorator on property runned mannually", () => {
    class TestPrivateData3 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData3({ name: "John Doe" });

    privateData(ORGA)(c, "name");
    privateData(ORGB)(c, "name");

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c,
      "name"
    );
    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(2);
    expect(propMetadata.collections).toContain(ORGA);
    expect(propMetadata.collections).toContain(ORGB);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c.constructor
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests multiple private data decorator on property present in the class", () => {
    class TestPrivateData4 extends Model {
      @required()
      @privateData(ORGA)
      @privateData(ORGB)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData4({ name: "John Doe" });

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c,
      "name"
    );
    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(2);
    expect(propMetadata.collections).toContain(ORGA);
    expect(propMetadata.collections).toContain(ORGB);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c.constructor
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests multiple private data decorator on class runned mannually", () => {
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    privateData(ORGA)(TestPrivateData5);
    privateData(ORGB)(TestPrivateData5);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData5
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests multiple private data decorator on class present in the class", () => {
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData5
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });
});

describe("Tests private data utility function", () => {
  it("Tests getPrivateDataMetadata on class with property decorated with privateData", () => {
    class TestPrivateData1 extends Model {
      @required()
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData1({ name: "John Doe" });

    const modelMetadata = getPrivateDataMetadata(c);

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests getPrivateDataMetadata on class with class decorated with privateData", () => {
    @privateData(ORGB)
    class TestPrivateData2 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData2({ name: "John Doe" });

    const modelMetadata = getPrivateDataMetadata(c);

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(1);
    expect(modelMetadata.collections[0]).toEqual(ORGB);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests multiple private data decorator on property runned mannually", () => {
    class TestPrivateData3 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData3({ name: "John Doe" });

    privateData(ORGA)(c, "name");
    privateData(ORGB)(c, "name");

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c,
      "name"
    );
    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(2);
    expect(propMetadata.collections).toContain(ORGA);
    expect(propMetadata.collections).toContain(ORGB);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData3
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests multiple private data decorator on property present in the class", () => {
    class TestPrivateData4 extends Model {
      @required()
      @privateData(ORGA)
      @privateData(ORGB)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData4({ name: "John Doe" });

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      c,
      "name"
    );
    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(2);
    expect(propMetadata.collections).toContain(ORGA);
    expect(propMetadata.collections).toContain(ORGB);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData4
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests multiple private data decorator on class runned mannually", () => {
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    privateData(ORGA)(TestPrivateData5);
    privateData(ORGB)(TestPrivateData5);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData5.constructor
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests multiple private data decorator on class present in the class", () => {
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData5.constructor
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });
});

// describe("Tests private data decorator in contract context", () => {
//   @table("tst_user")
//   @model()
//   @FabricObject()
//   class TestModel extends BaseModel {
//     @pk({ type: "Number" })
//     id!: number;

//     @column("tst_name")
//     @required()
//     @Property()
//     name!: string;

//     @column("tst_nif")
//     // @unique()
//     @minlength(9)
//     @maxlength(9)
//     @required()
//     @Property()
//     @privateData(ORGA)
//     nif!: string;

//     constructor(arg?: ModelArg<TestModel>) {
//       super(arg);
//     }
//   }

//   class TestContract extends SerializedCrudContract<TestModel> {
//     constructor() {
//       super(TestContract.name, TestModel);
//     }
//   }

//   let contract: TestContract;

//   beforeAll(async () => {
//     console.log("Initializing contract");
//     contract = new TestContract();
//   });

//   it("Should create", async () => {
//     const m = new TestModel({
//       name: randomName(6),
//       nif: randomNif(9),
//     }).serialize();

//     await contract.create(ctx as unknown as Context, m);

//     const keys = Object.keys(state);
//     keys.forEach((key) => {
//       console.log(state[key].toString());
//     });
//   });
// });
