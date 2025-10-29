import { stringFormat } from "@decaf-ts/decorator-validation";
import { Logger, Logging } from "@decaf-ts/logging";
import { Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import { User } from "fabric-common";

/**
 * @description Normalizes imports to handle both CommonJS and ESModule formats.
 * @summary Utility function to handle module import differences between formats.
 *
 * @template T - Type of the imported module.
 * @param {Promise<T>} importPromise - Promise returned by dynamic import.
 * @return {Promise<T>} Normalized module.
 *
 * @function normalizeImport
 *
 * @memberOf module:utils
 */
export async function normalizeImport<T>(
  importPromise: Promise<T>
): Promise<T> {
  // CommonJS's `module.exports` is wrapped as `default` in ESModule.
  return importPromise.then((m: any) => (m.default || m) as T);
}

/**
 * @description Core utilities for interacting with files, crypto identities, and Fabric SDK helpers
 * @summary Provides static helper methods to read credentials and keys from disk or raw content, construct Fabric gateway Identities and Signers, and perform common filesystem operations used by the Fabric client tooling.
 * @class CoreUtils
 * @example
 * // Read an identity and signer from directories
 * const identity = await CoreUtils.getIdentity('Org1MSP', '/msp/signcerts');
 * const signer = await CoreUtils.getSigner('/msp/keystore');
 * // Build a CA user
 * const user = await CoreUtils.getCAUser('appUser', pemKey, pemCert, 'Org1MSP');
 */
export class CoreUtils {
  private static logger: Logger = Logging.for(CoreUtils.name);

  private constructor() {}

  /**
   * @description Resolve file content from a path or return provided raw content
   * @summary If the input is a Uint8Array or PEM content, returns it as-is; otherwise uses a provided async fileReader to load the content from disk.
   * @param {string|Uint8Array} contentOrPath - Either a raw content buffer/string or a filesystem path
   * @param {function(string): Promise<string|Uint8Array|Buffer>} fileReader - Async function to read file content when a path is provided
   * @return {Promise<string|Uint8Array|Buffer>} The content to be used downstream
   */
  private static async contentOfLoadFile(
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
   * @description Read file content from a path or return provided Buffer
   * @summary Convenience wrapper that loads a file using fs.promises when a path string is provided; otherwise returns the given Buffer directly.
   * @param {string|Buffer} contentOrPath - Path to a file on disk or an already-loaded Buffer
   * @return {Promise<string|Uint8Array|Buffer>} The file content as a Buffer/string depending on reader
   */
  static async readFile(contentOrPath: string | Buffer) {
    if (typeof contentOrPath !== "string") return contentOrPath;

    const fileReader = async (path: string) => {
      const { promises } = await normalizeImport(import("fs"));
      return await promises.readFile(path);
    };

    return await fileReader(contentOrPath);
  }

  /**
   * @description Create a Fabric CA User object with enrollment
   * @summary Constructs a fabric-common User, sets a crypto suite, imports the provided private key, and sets enrollment with certificate and MSP ID.
   * @param {string} userName - The user name for the CA user
   * @param {string} privateKey - PEM-encoded private key
   * @param {string} certificate - PEM-encoded X.509 certificate
   * @param {string} mspId - Membership Service Provider identifier
   * @return {Promise<User>} The enrolled Fabric User instance
   */
  static async getCAUser(
    userName: string,
    privateKey: string,
    certificate: string,
    mspId: string
  ): Promise<User> {
    this.logger.debug(
      stringFormat(
        "Creating CA {0} user {1} with certificate {2}",
        mspId,
        userName,
        certificate
      )
    );
    const user = new User(userName);
    const cryptoSuite = User.newCryptoSuite();
    user.setCryptoSuite(cryptoSuite);
    const importedKey = cryptoSuite.createKeyFromRaw(privateKey);
    await user.setEnrollment(importedKey, certificate, mspId);
    return user;
  }

  /**
   * @description Build a Fabric Gateway Identity from an MSP ID and certificate
   * @summary Reads a certificate from a directory path or accepts raw content and returns an Identity object suitable for the Fabric Gateway.
   * @param {string} mspId - Membership Service Provider ID
   * @param {string} certDirectoryPath - Path to a directory containing the certificate file, or PEM content
   * @return {Promise<Identity>} The identity containing mspId and certificate credentials
   */
  static async getIdentity(
    mspId: string,
    certDirectoryPath: string
  ): Promise<Identity> {
    const identityFileReader = async (path: string) => {
      const { promises } = await normalizeImport(import("fs"));
      const certPath = await this.getFirstDirFileName(path);
      const credentials = await promises.readFile(certPath);
      return credentials;
    };

    const credentials: Uint8Array = (await this.contentOfLoadFile(
      certDirectoryPath,
      identityFileReader
    )) as Uint8Array;

    return { mspId, credentials };
  }

  static async getFirstDirFileName(dirPath: string): Promise<string> {
    const { promises } = await normalizeImport(import("fs"));
    const { join } = await normalizeImport(import("path"));
    const files = await promises.readdir(dirPath);
    return join(dirPath, files[0]);
  }

  static async getFirstDirFileNameContent(dirPath: string): Promise<string> {
    const { promises } = await normalizeImport(import("fs"));
    const { join } = await normalizeImport(import("path"));
    const files = await promises.readdir(dirPath);
    return (await promises.readFile(join(dirPath, files[0]))).toString();
  }

  static async getFileContent(filePath: string): Promise<string> {
    const { promises } = await normalizeImport(import("fs"));
    return (await promises.readFile(filePath)).toString();
  }

  static async getSigner(keyDirectoryPath: string): Promise<Signer> {
    const signerFileReader = async (path: string) => {
      const { promises } = await normalizeImport(import("fs"));
      const keyPath = await this.getFirstDirFileName(path);
      return await promises.readFile(keyPath);
    };

    const privateKeyPem = (await this.contentOfLoadFile(
      keyDirectoryPath,
      signerFileReader
    )) as Buffer;
    const privateKey = await this.extractPrivateKey(privateKeyPem);
    const keys = Object.getOwnPropertySymbols(privateKey);
    const k = (privateKey as any)[keys[0]];
    // --

    return signers.newPrivateKeySigner(k as any);
  }

  private static async extractPrivateKey(pem: Buffer) {
    const libName = "crypto";
    let subtle: any;
    if (
      (globalThis as any).window &&
      ((globalThis as any).window as { Crypto: any }).Crypto
    ) {
      subtle = ((globalThis as any).Crypto as any).subtle;
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
  }
}
