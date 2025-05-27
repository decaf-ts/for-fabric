import { normalizeImport } from "@decaf-ts/utils";
import { Logging } from "@decaf-ts/logging";
import { User } from "fabric-common";
import { Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import { isBrowser } from "@decaf-ts/utils/lib/utils/web";

const log = Logging.for("fabric-fs");

export async function contentOfLoadFile(
  contentOrPath: string | Uint8Array,
  fileReader: (path: string) => Promise<string | Uint8Array | Buffer>
) {
  if (contentOrPath instanceof Uint8Array) return contentOrPath;
  if (
    contentOrPath.match(
      /-----BEGIN (CERTIFICATE|KEY|PRIVATE KEY)-----.+?-----END \1-----$/gms
    )
  )
    return contentOrPath;
  return await fileReader(contentOrPath);
}

export async function readFile(contentOrPath: string | Buffer) {
  if (typeof contentOrPath !== "string") return contentOrPath;

  const fileReader = async (path: string) => {
    const { promises } = await normalizeImport(import("fs"));
    return await promises.readFile(path);
  };

  return await fileReader(contentOrPath);
}

export async function getCAUser(
  userName: string,
  privateKey: string,
  certificate: string,
  mspId: string
): Promise<User> {
  log.debug(
    `Creating a CA ${mspId} user ${userName} with certificate ${certificate}`
  );
  const user = new User(userName);
  const cryptoSuite = User.newCryptoSuite();
  user.setCryptoSuite(cryptoSuite);
  const importedKey = cryptoSuite.createKeyFromRaw(privateKey);
  await user.setEnrollment(importedKey, certificate, mspId);
  return user;
}

export async function getIdentity(
  mspId: string,
  certDirectoryPath: string
): Promise<Identity> {
  const identityFileReader = async (path: string) => {
    const { promises } = await normalizeImport(import("fs"));
    const certPath = await getFirstDirFileName(path);
    const credentials = await promises.readFile(certPath);
    return credentials;
  };

  const credentials: Uint8Array = (await contentOfLoadFile(
    certDirectoryPath,
    identityFileReader
  )) as Uint8Array;

  return { mspId, credentials };
}

export async function getFirstDirFileName(dirPath: string): Promise<string> {
  const { promises } = await normalizeImport(import("fs"));
  const { join } = await normalizeImport(import("path"));
  const files = await promises.readdir(dirPath);
  return join(dirPath, files[0]);
}

export async function getFirstDirFileNameContent(
  dirPath: string
): Promise<string> {
  const { promises } = await normalizeImport(import("fs"));
  const { join } = await normalizeImport(import("path"));
  const files = await promises.readdir(dirPath);
  return (await promises.readFile(join(dirPath, files[0]))).toString();
}

export async function getSigner(keyDirectoryPath: string): Promise<Signer> {
  const signerFileReader = async (path: string) => {
    const { promises } = await normalizeImport(import("fs"));
    const keyPath = await getFirstDirFileName(path);
    return await promises.readFile(keyPath);
  };

  const privateKeyPem = (await contentOfLoadFile(
    keyDirectoryPath,
    signerFileReader
  )) as Buffer;
  // Node based implementation
  // privateKey = createPrivateKey(privateKeyPem);
  // --

  // web based implementation
  const privateKey = await extractPrivateKey(privateKeyPem);
  const keys = Object.getOwnPropertySymbols(privateKey);
  const k = (privateKey as any)[keys[0]];
  // --

  return signers.newPrivateKeySigner(k as any);
}

export async function extractPrivateKey(pem: Buffer) {
  const libName = "crypto";
  let subtle;
  if (isBrowser()) {
    subtle = (globalThis as any).crypto.subtle;
  } else {
    const lib = (await normalizeImport(import(libName))) as any;
    subtle = lib.subtle || lib.webcrypto.subtle;
  }

  if (!subtle) throw new Error("Could not load SubtleCrypto module");

  function str2ab(str: string) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  const str = pem
    .toString("utf8")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replaceAll("\n", "")
    .replace("-----END PRIVATE KEY-----", "");
  const decoded = Buffer.from(str, "base64").toString("binary");
  const binaryDer = str2ab(decoded);
  try {
    const key = await subtle.importKey(
      "pkcs8",
      binaryDer,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign"]
    );

    return key;
  } catch (e: any) {
    throw e;
  }
}
