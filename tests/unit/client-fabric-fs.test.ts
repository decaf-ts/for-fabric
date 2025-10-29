import "reflect-metadata";

import { promises as fs } from "fs";
import * as path from "path";
import {
  contentOfLoadFile,
  readFile,
  getFirstDirFileName,
  getFirstDirFileNameContent,
  getIdentity,
  getSigner,
  extractPrivateKey,
} from "../../src/client/fabric-fs";

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg547BdDqx4+XgU/6c
MkHnVtO7eUN3DqqSY9mcdfqgACqhRANCAASKdZWLsjc9u4y1yxSCSVL9yw2xq9+h
flywLH3d4ohc51TXdnRh78x5VapoLy76faiCv6Dcyf3YJte0ZJ2bHpC3
-----END PRIVATE KEY-----`;

const CERT_PEM = `-----BEGIN CERTIFICATE-----
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

const TMP_ROOT = path.join(__dirname, "..", "tmp", "fabric-fs");

const createTempDir = async () => {
  const folder = path.join(
    TMP_ROOT,
    `case-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(folder, { recursive: true });
  return folder;
};

describe("client/fabric-fs helpers", () => {
  beforeAll(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  });

  it("returns content unchanged for buffers and PEM strings", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const pem =
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
    const reader = jest.fn();

    expect(await contentOfLoadFile(bytes, reader)).toBe(bytes);
    expect(await contentOfLoadFile(pem, reader)).toBe(pem);
    expect(reader).not.toHaveBeenCalled();
  });

  it("delegates to file reader for paths", async () => {
    const reader = jest.fn(async (p: string) => `${p}:loaded`);
    await expect(contentOfLoadFile("/tmp/file.ca", reader)).resolves.toBe(
      "/tmp/file.ca:loaded"
    );
  });

  it("reads files from disk when provided a path", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "material.pem");
    await fs.writeFile(filePath, CERT_PEM);

    const content = await readFile(filePath);
    expect(content.toString()).toBe(CERT_PEM);
  });

  it("resolves first file in a directory and returns content", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "b.pem"), "second");
    await fs.writeFile(path.join(dir, "a.pem"), "first");

    const first = await getFirstDirFileName(dir);
    expect(first.endsWith("a.pem")).toBe(true);
    const content = await getFirstDirFileNameContent(dir);
    expect(content).toBe("first");
  });

  it("builds identities from certificate directories", async () => {
    const certDir = await createTempDir();
    await fs.writeFile(path.join(certDir, "cert.pem"), CERT_PEM);

    const identity = await getIdentity("Org1MSP", certDir);
    expect(identity.mspId).toBe("Org1MSP");
    expect(identity.credentials).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(identity.credentials).toString()).toContain(
      "BEGIN CERTIFICATE"
    );
  });

  it("creates signers from key directories", async () => {
    const keyDir = await createTempDir();
    await fs.writeFile(path.join(keyDir, "key.pem"), PRIVATE_KEY_PEM);

    const signer = await getSigner(keyDir);
    expect(typeof signer).toBe("function");
  });

  it("extracts private keys from PEM buffers", async () => {
    const key = await extractPrivateKey(Buffer.from(PRIVATE_KEY_PEM));
    expect((key as CryptoKey).type).toBe("private");
  });
});
