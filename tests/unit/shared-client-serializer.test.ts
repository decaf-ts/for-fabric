import "reflect-metadata";

import { SerializationError } from "@decaf-ts/db-decorators";
import { ModelKeys } from "@decaf-ts/decorator-validation";
import { ClientSerializer } from "../../src/shared/ClientSerializer";
import { Identity } from "../../src/shared/model/Identity";
import { IdentityCredentials } from "../../src/shared/model/IdentityCredentials";

describe("shared/ClientSerializer", () => {
  const serializer = new ClientSerializer<Identity>();

  it("serializes and deserializes Identity models with metadata anchor", () => {
    const identity = new Identity({
      id: "user1",
      mspId: "Org1MSP",
      credentials: new IdentityCredentials({
        id: "cred1",
        certificate: "cert",
        rootCertificate: "root",
        privateKey: "key",
      }),
    });

    const serialized = serializer.serialize(identity);
    const parsed = JSON.parse(serialized);

    expect(parsed).toHaveProperty(ModelKeys.ANCHOR, "Identity");

    const restored = serializer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Identity);
    expect(restored.id).toBe("user1");
    expect(restored.mspId).toBe("Org1MSP");
  });

  it("throws serialization error when metadata is missing", () => {
    expect(() =>
      serializer.serialize({ test: true } as unknown as Identity)
    ).toThrow(SerializationError);
  });

  it("throws when deserialization lacks metadata anchor", () => {
    expect(() => serializer.deserialize("{}")).toThrow(
      "Could not find class reference in serialized model"
    );
  });
});
