import { TLSOptions } from "fabric-ca-client";
import { CAConfig } from "../../src/shared";

export const tls: TLSOptions = {
  trustedRoots: "Buffer | string[]",
  verify: false,
};

export const caConfig: CAConfig = {
  url: "https://org-a-admin:org-a-admin-pw@org-a:7011",
  tls: tls,
  caName: "ca",
  caCert: "cer",
  caKey: "key",
};
