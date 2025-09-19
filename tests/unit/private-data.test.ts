import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { getFabricModelKey, privateData } from "../../src/shared/decorators";
import { FabricModelKeys } from "../../src/shared/constants";

jest.setTimeout(5000000);

const ORGExample = "_implicit_org_Org1MSP";

describe("@privateData() decorator", () => {
  const ORGA = "OrganizationA";
  const ORGB = "OrganizationB";
  it("tests private data decorator on property", () => {
    class TestPrivateData extends Model {
      @privateData(ORGA)
      name!: string;
      constructor(arg?: ModelArg<Model>) {
        super(arg);
      }
    }

    const instance = new TestPrivateData({ name: "John Doe" });

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance,
      "name"
    );

    console.log(propMetadata);

    expect(propMetadata.collections.length).toBe(1);
    expect(propMetadata.collections[0]).toBe(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData
    );

    console.log(modelMetadata);

    expect(Object.keys(modelMetadata).length).toBe(1);
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

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData
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

    const propMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance,
      "name"
    );

    console.log(propMetadata);
    expect(propMetadata.collections.length).toBe(1);
    expect(propMetadata.collections).toContain(ORGA);
    expect(Object.keys(propMetadata).length).toBe(1);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance.constructor
    );

    console.log(modelMetadata);
    expect(Object.keys(modelMetadata).length).toBe(1);
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

    const classMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData
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

    const instance = new TestPrivateData({
      name: "John Doe",
      nif: "123456789",
    });

    const propMetadata1 = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance,
      "name"
    );

    const propMetadata2 = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance,
      "nif"
    );

    console.log(propMetadata1);
    console.log(propMetadata2);
    expect(propMetadata1.collections.length).toBe(2);
    expect(propMetadata2.collections.length).toBe(1);
    expect(propMetadata1.collections).toContain(ORGA);
    expect(propMetadata1.collections).toContain(ORGB);
    expect(propMetadata2.collections).toContain(ORGA);

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance.constructor
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

    const modelMetadata = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData
    );

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
      getFabricModelKey(FabricModelKeys.PRIVATE),
      instance,
      "name"
    );

    const propMetadata2 = Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
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
      getFabricModelKey(FabricModelKeys.PRIVATE),
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
      getFabricModelKey(FabricModelKeys.PRIVATE),
      TestPrivateData
    );

    console.log(classMetadata);
    expect(Object.keys(classMetadata).length).toBe(2);
    expect(classMetadata.collections.length).toEqual(2);
    expect(classMetadata.collections).toContain(ORGA);
    expect(classMetadata.collections).toContain(ORGB);
    expect(classMetadata.isPrivate).toBe(true);
  });
});
