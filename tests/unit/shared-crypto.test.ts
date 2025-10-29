import { CryptoUtils } from "../../src/shared/crypto";

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg547BdDqx4+XgU/6c
MkHnVtO7eUN3DqqSY9mcdfqgACqhRANCAASKdZWLsjc9u4y1yxSCSVL9yw2xq9+h
flywLH3d4ohc51TXdnRh78x5VapoLy76faiCv6Dcyf3YJte0ZJ2bHpC3
-----END PRIVATE KEY-----`;

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEinWVi7I3PbuMtcsUgklS/csNsavf
oX5csCx93eKIXOdU13Z0Ye/MeVWqaC8u+n2ogr+g3Mn92CbXtGSdmx6Qtw==
-----END PUBLIC KEY-----`;

const CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIICFTCCAbugAwIBAgIUfJX7hC/K370mvzJeA5WunOxsQzswCgYIKoZIzj0EAwIw
YDELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAk5ZMQwwCgYDVQQHDANOWUMxEjAQBgNV
BAoMCUZvckZhYnJpYzEOMAwGA1UECwwFVGVzdHMxEjAQBgNVBAMMCXVuaXQudGVz
dDAeFw0yNTEwMjgxODM4MjNaFw0yNjEwMjgxODM4MjNaMGAxCzAJBgNVBAYTAlVT
MQswCQYDVQQIDAJOWTEMMAoGA1UEBwwDTllDMRIwEAYDVQQKDAlGb3JGYWJyaWMx
DjAMBgNVBAsMBVRlc3RzMRIwEAYDVQQDDAl1bml0LnRlc3QwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAASKdZWLsjc9u4y1yxSCSVL9yw2xq9+hflywLH3d4ohc51TX
dnRh78x5VapoLy76faiCv6Dcyf3YJte0ZJ2bHpC3o1MwUTAdBgNVHQ4EFgQUtlNF
1TWmAiAy6UcEIGoTo/FWtcYwHwYDVR0jBBgwFoAUtlNF1TWmAiAy6UcEIGoTo/FW
tcYwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiA5LOwZ8SVjgcbR
ZAyLbI1P+7QoBI78xACsMKL+NHb6AAIhAOHuueJBlvB3YmyDYXViPNh8H1VK+IgZ
aNUApmLEXF+k
-----END CERTIFICATE-----`;

describe("shared/crypto CryptoUtils", () => {
  it("computes fabric identity string from certificate", () => {
    expect(CryptoUtils.fabricIdFromCertificate(CERTIFICATE_PEM)).toBe(
      "x509::/C=US/ST=NY/L=NYC/O=ForFabric/OU=Tests/CN=unit.test::/C=US/ST=NY/L=NYC/O=ForFabric/OU=Tests/CN=unit.test"
    );
  });

  it("encodes and decodes base58 strings", () => {
    const encoded = CryptoUtils.encode("fabric");
    expect(typeof encoded).toBe("string");
    expect(CryptoUtils.decode(encoded)).toBe("fabric");
  });

  it("converts strings to array buffers", () => {
    const buffer = CryptoUtils.stringToArrayBuffer("abc");
    expect(buffer.byteLength).toBe(3);
  });

  it("extracts private key and rejects unsupported public key import", async () => {
    const privateKey = await CryptoUtils.extractPrivateKey(PRIVATE_KEY_PEM);
    expect((privateKey as CryptoKey).type).toBe("private");

    await expect(
      CryptoUtils.extractPublicKey(PUBLIC_KEY_PEM)
    ).rejects.toThrow();
  });

  it("signs and verifies data with provided keys", async () => {
    const data = Buffer.from("fabric-utils");
    const signature = await CryptoUtils.sign(PRIVATE_KEY_PEM, data);
    expect(signature).toMatch(/^[0-9a-f]+$/);

    await expect(
      CryptoUtils.verify(CERTIFICATE_PEM, signature, data)
    ).resolves.toBe(true);
  });

  it("derives keys and encrypts/decrypts PINs", async () => {
    const master = await CryptoUtils.getMaster();
    const derived = await CryptoUtils.getDerivationKey("salt", master.key);
    expect(derived.iv.byteLength).toBeGreaterThan(0);

    const encrypted = await CryptoUtils.encryptPin("1234", derived);
    const decrypted = await CryptoUtils.decryptPin(encrypted, derived);
    expect(decrypted).toBe("1234");
  });

  it("rejects unsupported encrypt/decrypt flows", async () => {
    await expect(
      CryptoUtils.encrypt(CERTIFICATE_PEM, "payload")
    ).rejects.toThrow();

    await expect(
      CryptoUtils.decrypt(PRIVATE_KEY_PEM, "deadbeef")
    ).rejects.toThrow();
  });
});
