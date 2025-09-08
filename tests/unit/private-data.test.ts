import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import {
  FabricModelKeys,
  getClassPrivateDataMetadata,
  getFabricModelKey,
  hasPrivateData,
  isModelPrivate,
  modelToPrivate,
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
const ORGExample = "_implicit_org_Org1MSP";

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

    const modelMetadata = getClassPrivateDataMetadata(c);

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

    const modelMetadata = getClassPrivateDataMetadata(c);

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(1);
    expect(modelMetadata.collections[0]).toEqual(ORGB);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests getPrivateDataMetadata on class running multiple decorators on property manually", () => {
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

    const modelMetadata = getClassPrivateDataMetadata(c);

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests getPrivateDataMetadata on class with property decorated with multiple decorators", () => {
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

    const modelMetadata = getClassPrivateDataMetadata(c);
    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("Tests getPrivateDataMetadata on class running manually multiple decorators on class", () => {
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData5({ name: "John Doe" });

    privateData(ORGA)(TestPrivateData5);
    privateData(ORGB)(TestPrivateData5);

    const modelMetadata = getClassPrivateDataMetadata(c);
    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests getPrivateDataMetadata on class with multiple decoraters at the class level", () => {
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData5 extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData5({ name: "John Doe" });

    const modelMetadata = getClassPrivateDataMetadata(c);

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("Tests hasPrivateData function on class decorated with privateData", () => {
    @privateData(ORGA)
    class TestPrivateData extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const hasPrivate = hasPrivateData(c);
    console.log(hasPrivate);
    expect(hasPrivate).toBe(true);
  });

  it("Tests hasPrivateData function on class not decorated", () => {
    class TestPrivateData extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const hasPrivate = hasPrivateData(c);
    console.log(hasPrivate);
    expect(hasPrivate).toBe(false);
  });

  it("Tests hasPrivateData function on class with property decorated with privateData", () => {
    class TestPrivateData extends Model {
      @required()
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const hasPrivate = hasPrivateData(c);
    console.log(hasPrivate);
    expect(hasPrivate).toBe(true);
  });

  it("Tests isModelPrivate function on class decorated with privateData", () => {
    @privateData(ORGA)
    class TestPrivateData extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(true);
  });

  it("Tests isModelPrivate function on class with property decorated with privateData", () => {
    class TestPrivateData extends Model {
      @required()
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(false);
  });

  it("Tests isModelPrivate function on class with no private data decorators", () => {
    class TestPrivateData extends Model {
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({ name: "John Doe" });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(false);
  });

  it("Tests modelToPrivate function on class not decorated with privateData", () => {
    @model()
    class TestPrivateData extends Model {
      @required()
      name!: string;

      @required()
      age!: string;

      @required()
      size!: string;

      @required()
      description!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({
      name: "John Doe",
      age: "25",
      size: "medium",
      description: "A test model",
    });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(false);

    const res = modelToPrivate(c);

    expect(res.model.name).toBe(c.name);
    expect(res.model.age).toBe(c.age);
    expect(res.model.size).toBe(c.size);
    expect(res.model.description).toBe(c.description);
    expect(res.private).toBeUndefined();
  });

  it("Tests modelToPrivate function on class decorated with privateData", () => {
    @model()
    @privateData(ORGA)
    class TestPrivateData extends Model {
      @required()
      name!: string;

      @required()
      age!: string;

      @required()
      size!: string;

      @required()
      description!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({
      name: "John Doe",
      age: "25",
      size: "medium",
      description: "A test model",
    });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(true);

    const res = modelToPrivate(c);
    console.log(res);

    expect(res.private).toBeDefined();
    expect(res.private![ORGA].name).toBe(c.name);
    expect(res.private![ORGA].age).toBe(c.age);
    expect(res.private![ORGA].size).toBe(c.size);
    expect(res.private![ORGA].description).toBe(c.description);
    expect(res.model.name).toBeUndefined();
    expect(res.model.age).toBeUndefined();
    expect(res.model.size).toBeUndefined();
    expect(res.model.description).toBeUndefined();
  });

  it("Tests modelToPrivate function on class decorated with multiple privateData", () => {
    @model()
    @privateData(ORGB)
    @privateData(ORGA)
    class TestPrivateData extends Model {
      @required()
      name!: string;

      @required()
      age!: string;

      @required()
      size!: string;

      @required()
      description!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({
      name: "John Doe",
      age: "25",
      size: "medium",
      description: "A test model",
    });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(true);

    const res = modelToPrivate(c);
    console.log(res);

    expect(res.private).toBeDefined();
    expect(res.private![ORGA].name).toBe(c.name);
    expect(res.private![ORGA].age).toBe(c.age);
    expect(res.private![ORGA].size).toBe(c.size);
    expect(res.private![ORGA].description).toBe(c.description);
    expect(res.private![ORGB].name).toBe(c.name);
    expect(res.private![ORGB].age).toBe(c.age);
    expect(res.private![ORGB].size).toBe(c.size);
    expect(res.private![ORGB].description).toBe(c.description);
    expect(res.model.name).toBeUndefined();
    expect(res.model.age).toBeUndefined();
    expect(res.model.size).toBeUndefined();
    expect(res.model.description).toBeUndefined();
  });

  it("Tests modelToPrivate function on class decorated with privateData", () => {
    @model()
    class TestPrivateData extends Model {
      @required()
      @privateData(ORGA)
      name!: string;

      @required()
      @privateData(ORGA)
      age!: string;

      @required()
      size!: string;

      @required()
      description!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({
      name: "John Doe",
      age: "25",
      size: "medium",
      description: "A test model",
    });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(false);

    const res = modelToPrivate(c);
    console.log(res);

    expect(res.private).toBeDefined();
    expect(res.model).toBeDefined();
    expect(res.private![ORGA].name).toBe(c.name);
    expect(res.private![ORGA].age).toBe(c.age);
    expect(res.model.size).toBe(c.size);
    expect(res.model.description).toBe(c.description);
    expect(res.model.name).toBeUndefined();
    expect(res.model.age).toBeUndefined();
    expect(res.private![ORGA].size).toBeUndefined();
    expect(res.private![ORGA].description).toBeUndefined();
  });

  it("Tests modelToPrivate function on class decorated with multiple privateData in the properties", () => {
    @model()
    class TestPrivateData extends Model {
      @required()
      @privateData(ORGA)
      name!: string;

      @required()
      @privateData(ORGB)
      @privateData(ORGA)
      age!: string;

      @required()
      @privateData(ORGA)
      @privateData(ORGB)
      size!: string;

      @required()
      @privateData(ORGB)
      @privateData(ORGExample)
      description!: string;

      @required()
      test!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const c = new TestPrivateData({
      name: "John Doe",
      age: "25",
      size: "medium",
      description: "A test model",
      test: "something",
    });

    const isPrivate = isModelPrivate(c);
    console.log(isPrivate);
    expect(isPrivate).toBe(false);

    const res = modelToPrivate(c);
    console.log(res);

    expect(res.private).toBeDefined();
    expect(res.model).toBeDefined();
    expect(res.private![ORGA].name).toBe(c.name);
    expect(res.private![ORGB].name).toBeUndefined();
    expect(res.private![ORGA].age).toBe(c.age);
    expect(res.private![ORGB].age).toBe(c.age);
    expect(res.private![ORGA].size).toBe(c.size);
    expect(res.private![ORGB].size).toBe(c.size);
    expect(res.private![ORGB].description).toBe(c.description);
    expect(res.private![ORGA].description).toBeUndefined();
    expect(res.private![ORGB].test).toBeUndefined();
    expect(res.private![ORGA].test).toBeUndefined();
    expect(res.model.name).toBeUndefined();
    expect(res.model.age).toBeUndefined();
    expect(res.model.size).toBeUndefined();
    expect(res.model.description).toBeUndefined();
    expect(res.model.test).toBe(c.test);
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
