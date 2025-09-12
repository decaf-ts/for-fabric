import { normalizeImport } from "@decaf-ts/utils";
import { Logging } from "@decaf-ts/logging";
import { User } from "fabric-common";
import { Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import { isBrowser } from "@decaf-ts/utils";
import { InternalError } from "@decaf-ts/db-decorators";

const log = Logging.for("fabric-fs");

/**
 * @description Loads content from a file or returns the content if already loaded
 * @summary Determines if the input is already content or a path to a file, and loads the file if needed
 * @param {string | Uint8Array} contentOrPath - The content or path to load
 * @param {Function} fileReader - Function to read the file if contentOrPath is a path
 * @return {Promise<string | Uint8Array | Buffer>} The content
 * @function contentOfLoadFile
 * @memberOf module:client
 */
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

/**
 * @description Reads a file from the file system
 * @summary Loads a file using the Node.js file system module
 * @param {string | Buffer} contentOrPath - The content or path to load
 * @return {Promise<Buffer>} The file content as a Buffer
 * @function readFile
 * @memberOf module:client
 */
export async function readFile(contentOrPath: string | Buffer) {
  if (typeof contentOrPath !== "string") return contentOrPath;

  const fileReader = async (path: string) => {
    const { promises } = await normalizeImport(import("fs"));
    return await promises.readFile(path);
  };

  return await fileReader(contentOrPath);
}

/**
 * @description Creates a Certificate Authority user
 * @summary Initializes a user with the given credentials for interacting with a Fabric CA
 * @param {string} userName - The user name
 * @param {string} privateKey - The private key as a string
 * @param {string} certificate - The certificate as a string
 * @param {string} mspId - The Membership Service Provider ID
 * @return {Promise<User>} Promise resolving to the created user
 * @function getCAUser
 * @memberOf module:client
 */
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

/**
 * @description Gets an identity from a certificate directory
 * @summary Loads a certificate from a directory and creates an Identity object
 * @param {string} mspId - The Membership Service Provider ID
 * @param {string} certDirectoryPath - Path to the directory containing the certificate
 * @return {Promise<Identity>} Promise resolving to the identity
 * @function getIdentity
 * @memberOf module:client
 */
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

/**
 * @description Gets the full path of the first file in a directory
 * @summary Reads a directory and returns the path to the first file found
 * @param {string} dirPath - Path to the directory
 * @return {Promise<string>} Promise resolving to the full path of the first file
 * @function getFirstDirFileName
 * @memberOf module:client
 */
export async function getFirstDirFileName(dirPath: string): Promise<string> {
  const { promises } = await normalizeImport(import("fs"));
  const { join } = await normalizeImport(import("path"));
  const files = await promises.readdir(dirPath);
  return join(dirPath, files[0]);
}

/**
 * @description Gets the content of the first file in a directory
 * @summary Reads a directory, finds the first file, and returns its content as a string
 * @param {string} dirPath - Path to the directory
 * @return {Promise<string>} Promise resolving to the content of the first file
 * @function getFirstDirFileNameContent
 * @memberOf module:client
 */
export async function getFirstDirFileNameContent(
  dirPath: string
): Promise<string> {
  const { promises } = await normalizeImport(import("fs"));
  const { join } = await normalizeImport(import("path"));
  const files = await promises.readdir(dirPath);
  return (await promises.readFile(join(dirPath, files[0]))).toString();
}

/**
 * @description Gets a signer from a key directory
 * @summary Loads a private key from a directory and creates a Signer for Fabric transactions
 * @param {string} keyDirectoryPath - Path to the directory containing the private key
 * @return {Promise<Signer>} Promise resolving to the signer
 * @function getSigner
 * @memberOf module:client
 */
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

/**
 * @description Extracts a private key from a PEM buffer
 * @summary Converts a PEM-encoded private key to a CryptoKey object
 * @param {Buffer} pem - The PEM-encoded private key
 * @return {Promise<CryptoKey>} Promise resolving to the CryptoKey
 * @function extractPrivateKey
 * @memberOf module:client
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant ExtractPrivateKey
 *   participant SubtleCrypto
 *
 *   Caller->>ExtractPrivateKey: extractPrivateKey(pem)
 *   ExtractPrivateKey->>ExtractPrivateKey: Get SubtleCrypto implementation
 *   ExtractPrivateKey->>ExtractPrivateKey: Parse PEM format
 *   ExtractPrivateKey->>ExtractPrivateKey: Convert to binary DER
 *   ExtractPrivateKey->>SubtleCrypto: importKey(pkcs8, binaryDer, options)
 *   SubtleCrypto-->>ExtractPrivateKey: CryptoKey
 *   ExtractPrivateKey-->>Caller: CryptoKey
 */
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
    throw new InternalError(e);
  }
}
