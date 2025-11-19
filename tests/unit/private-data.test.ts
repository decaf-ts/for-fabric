import {
  model,
  Model,
  ModelArg,
  ModelKeys,
  required,
} from "@decaf-ts/decorator-validation";
import { privateData } from "../../src/shared/decorators";
import { FabricModelKeys } from "../../src/shared/constants";
import {
  getClassPrivateDataMetadata,
  hasPrivateData,
  isModelPrivate,
  modelToPrivate,
} from "../../src/contracts/private-data";
import { Metadata, prop } from "@decaf-ts/decoration";

jest.setTimeout(5000000);

const ORGA = "OrganizationA";
const ORGB = "OrganizationB";
// const ORGExample = "_implicit_org_Org1MSP";

describe.skip("@privateData() decorator", () => {
  it("tests private data decorator on property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const propMetadata = Metadata.get(
      TestPrivateData,
      Metadata.key(FabricModelKeys.PRIVATE, "name")
    );

    console.log(propMetadata);

    expect(propMetadata.collections?.length).toBe(1);
    expect(propMetadata.collections[0]).toBe(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );

    console.log(modelMetadata);
    // TODO: Ask why this was set to 1
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("tests private data decorator on class", () => {
    @privateData(ORGB)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(1);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("tests private data decorator called manually on property", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    privateData(ORGA)(instance, "name");

    const propMetadata = Metadata.get(
      TestPrivateData,
      Metadata.key(FabricModelKeys.PRIVATE, "name")
    );

    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(1);
    expect(propMetadata.collections).toContain(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("tests private data decorator called manually on class", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    privateData(ORGB)(TestPrivateData);

    const classMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );

    console.log(classMetadata);
    expect(Object.keys(classMetadata).length).toBe(2);
    expect(classMetadata.collections.length).toEqual(1);
    expect(classMetadata.collections).toContain(ORGB);
    expect(classMetadata.isPrivate).toBe(true);
  });

  it("tests multiple private data decorators on multiple properties", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      @privateData(ORGB)
      name!: string;

      @privateData(ORGA)
      nif!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    // const instance = new TestPrivateData({
    //   name: "John Doe",
    //   nif: "123456789",
    // });

    // TODO: Fix overwriting of properties at decorator

    const propMetadata1 = Metadata.get(
      TestPrivateData,
      Metadata.key(FabricModelKeys.PRIVATE, "name")
    );
    const propMetadata2 = Metadata.get(
      TestPrivateData,
      Metadata.key(FabricModelKeys.PRIVATE, "nif")
    );

    console.log(propMetadata1);
    console.log(propMetadata2);
    expect(propMetadata1?.collections).toBeDefined();
    expect(propMetadata1.collections?.length).toBe(2);
    expect(propMetadata2.collections?.length).toBe(1);
    expect(propMetadata1.collections).toContain(ORGA);
    expect(propMetadata1.collections).toContain(ORGB);
    expect(propMetadata2.collections).toContain(ORGA);

    const modelMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );
    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("tests multiple private data decorators on class", () => {
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Metadata.get(
      TestPrivateData,
      FabricModelKeys.PRIVATE
    );

    // const modelMetadata = Reflect.getMetadata(
    //   FabricModelKeys.PRIVATE,
    //   TestPrivateData
    // );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(2);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.collections).toContain(ORGA);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("tests multiple private data decorators on multiple properties runned mannually", () => {
    class TestPrivateData extends Model {
      name!: string;
      nif!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    privateData(ORGA)(instance, "name");
    privateData(ORGB)(instance, "name");
    privateData(ORGA)(instance, "nif");

    const propMetadata1 = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      instance,
      "name"
    );

    const propMetadata2 = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      instance,
      "nif"
    );

    console.log(propMetadata1);
    expect(propMetadata1.collections.length).toBe(2);
    expect(propMetadata1.collections).toContain(ORGA);
    expect(propMetadata1.collections).toContain(ORGB);
    expect(Object.keys(propMetadata1).length).toBe(1);

    console.log(propMetadata2);
    expect(propMetadata2.collections.length).toBe(1);
    expect(propMetadata2.collections).toContain(ORGA);
    expect(Object.keys(propMetadata2).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      instance.constructor
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });

  it("tests multiple private data decorator called manually on class", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    privateData(ORGA)(TestPrivateData);
    privateData(ORGB)(TestPrivateData);

    const classMetadata = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      TestPrivateData
    );

    console.log(classMetadata);
    expect(Object.keys(classMetadata).length).toBe(2);
    expect(classMetadata.collections.length).toEqual(2);
    expect(classMetadata.collections).toContain(ORGA);
    expect(classMetadata.collections).toContain(ORGB);
    expect(classMetadata.isPrivate).toBe(true);
  });

  it("tests if private data decorator playes well with other decorators on class", () => {
    @privateData(ORGB)
    @model()
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const modelMetadata = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      (TestPrivateData as any)[ModelKeys.ANCHOR] || TestPrivateData
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(2);
    expect(modelMetadata.collections.length).toEqual(1);
    expect(modelMetadata.collections).toContain(ORGB);
    expect(modelMetadata.isPrivate).toBe(true);
  });

  it("tests if private data decorator works with other decorators on property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const propMetadata = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      instance,
      "name"
    );

    console.log(propMetadata);

    expect(propMetadata.collections.length).toBe(1);
    expect(propMetadata.collections[0]).toBe(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      FabricModelKeys.PRIVATE,
      TestPrivateData
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
    expect(modelMetadata.isPrivate).toBe(false);
  });
});

describe.skip("getClassPrivateDataMetadata", () => {
  it("Tests getClassPrivateDataMetadata on decorated property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);

    expect(Object.keys(metadata).length).toBe(1);
    expect(metadata.isPrivate).toBe(false);
  });

  it("Tests getClassPrivateDataMetadata on decorated class", () => {
    @privateData(ORGA)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);
    expect(Object.keys(metadata).length).toBe(2);
    expect(metadata.collections.length).toEqual(1);
    expect(metadata.collections).toContain(ORGA);
    expect(metadata.isPrivate).toBe(true);
  });

  it("Tests getClassPrivateDataMetadata on decorated property with multiple decorators", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      @privateData(ORGB)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);

    expect(Object.keys(metadata).length).toBe(1);
    expect(metadata.isPrivate).toBe(false);
  });

  it("Tests getClassPrivateDataMetadata on decorated class with multiple decorators", () => {
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);
    expect(Object.keys(metadata).length).toBe(2);
    expect(metadata.collections.length).toEqual(2);
    expect(metadata.collections).toContain(ORGB);
    expect(metadata.collections).toContain(ORGA);
    expect(metadata.isPrivate).toBe(true);
  });

  it("Tests getClassPrivateDataMetadata on non-decorated property or class", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);
    expect(metadata).toBeUndefined();
  });

  it("Tests getClassPrivateDataMetadata on decorated property with multiple decorators runned manually", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    privateData(ORGA)(instance, "name");
    privateData(ORGB)(instance, "name");

    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);

    expect(Object.keys(metadata).length).toBe(1);
    expect(metadata.isPrivate).toBe(false);
  });

  it("Tests getClassPrivateDataMetadata on decorated class with multiple decorators runned manually", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    privateData(ORGA)(TestPrivateData);
    privateData(ORGB)(TestPrivateData);

    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);

    expect(Object.keys(metadata).length).toBe(2);
    expect(metadata.isPrivate).toBe(true);
    expect(metadata.collections.length).toEqual(2);
    expect(metadata.collections).toContain(ORGA);
    expect(metadata.collections).toContain(ORGB);
  });

  it("Tests getClassPrivateDataMetadata on decorated class with different decorators", () => {
    @privateData(ORGA)
    @model()
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);
    expect(Object.keys(metadata).length).toBe(2);
    expect(metadata.collections.length).toEqual(1);
    expect(metadata.collections).toContain(ORGA);
    expect(metadata.isPrivate).toBe(true);
  });

  it("Tests getClassPrivateDataMetadata on decorated property  with different decorators", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      @required()
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });
    const metadata = getClassPrivateDataMetadata(instance);

    console.log(metadata);

    expect(Object.keys(metadata).length).toBe(1);
    expect(metadata.isPrivate).toBe(false);
  });
});

describe.skip("hasPrivateData", () => {
  it("Tests hasPrivateData on decorated class", () => {
    @privateData(ORGA)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = hasPrivateData(instance);

    console.log(metadata);

    expect(metadata).toBe(true);
  });
  it("Tests hasPrivateData on decorated property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = hasPrivateData(instance);

    console.log(metadata);

    expect(metadata).toBe(true);
  });
  it("Tests hasPrivateData on non-decorated property or class", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = hasPrivateData(instance);

    console.log(metadata);

    expect(metadata).toBe(false);
  });
});

describe.skip("isModelPrivate", () => {
  it("Tests isModelPrivate on decorated property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = isModelPrivate(instance);

    console.log(metadata);

    expect(metadata).toBe(false);
  });
  it("Tests isModelPrivate on decorated class", () => {
    @privateData(ORGA)
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = isModelPrivate(instance);

    console.log(metadata);

    expect(metadata).toBe(true);
  });
  it("Tests isModelPrivate on non-decorated property or class", () => {
    class TestPrivateData extends Model {
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const metadata = isModelPrivate(instance);

    console.log(metadata);

    expect(metadata).toBe(false);
  });
});

describe.skip("modelToPrivate", () => {
  it("Tests modelToPrivate on decorated property", () => {
    @model()
    class TestPrivateData extends Model {
      @privateData(ORGA)
      @privateData(ORGB)
      name!: string;
      constructor(arg?: ModelArg<TestPrivateData>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "Jane Doe" });

    const result = modelToPrivate(instance);
    expect(result.model).toBeInstanceOf(TestPrivateData);
    expect(result.private).toBeDefined();
    expect(Object.keys(result.private!).length).toBe(2);
    expect(Object.keys(result.private!)).toContain(ORGA);
    expect(Object.keys(result.private!)).toContain(ORGB);
    expect(result.private![ORGA]!.name).toBe("Jane Doe");
    expect(result.private![ORGB]!.name).toBe("Jane Doe");
  });

  it("Tests modelToPrivate on decorated class", () => {
    @model()
    @privateData(ORGA)
    @privateData(ORGB)
    class TestPrivateData extends Model {
      @prop()
      name!: string;
      constructor(arg?: ModelArg<TestPrivateData>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "Jane Doe" });

    const result = modelToPrivate(instance);
    expect(result.model).toBeInstanceOf(TestPrivateData);
    expect(result.private).toBeDefined();
    expect(Object.keys(result.private!).length).toBe(2);
    expect(Object.keys(result.private!)).toContain(ORGA);
    expect(Object.keys(result.private!)).toContain(ORGB);
    expect(result.private![ORGA]!.name).toBe("Jane Doe");
    expect(result.private![ORGB]!.name).toBe("Jane Doe");
  });

  it("Tests modelToPrivate on non-decorated property or class", () => {
    @model()
    class TestPrivateData extends Model {
      @prop()
      name!: string;
      constructor(arg?: ModelArg<TestPrivateData>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "Jane Doe" });

    const result = modelToPrivate(instance);
    expect(result.model).toBeInstanceOf(TestPrivateData);
    expect(result.private).toBeUndefined();
    expect(result.model.name).toEqual(instance.name);
  });
});
