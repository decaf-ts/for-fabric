import { stringFormat } from "@decaf-ts/decorator-validation";
import { Logger, Logging } from "@decaf-ts/logging";
import { normalizeImport } from "@decaf-ts/utils";
import { Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import { User } from "fabric-common";

export class CoreUtils {
  private static logger: Logger = Logging.for(CoreUtils.name);

  private constructor() {}

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

  static async readFile(contentOrPath: string | Buffer) {
    if (typeof contentOrPath !== "string") return contentOrPath;

    const fileReader = async (path: string) => {
      const { promises } = await normalizeImport(import("fs"));
      return await promises.readFile(path);
    };

    return await fileReader(contentOrPath);
  }

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

  static async getSigner(keyDirectoryPath: string): Promise<Signer> {
    let privateKey;

    const signerFileReader = async (path: string) => {
      const { promises } = await normalizeImport(import("fs"));
      const keyPath = await this.getFirstDirFileName(path);
      return await promises.readFile(keyPath);
    };

    const privateKeyPem = (await this.contentOfLoadFile(
      keyDirectoryPath,
      signerFileReader
    )) as Buffer;
    // Node based implementation
    // privateKey = createPrivateKey(privateKeyPem);
    // --

    // web based implementation
    privateKey = await this.extractPrivateKey(privateKeyPem);
    const keys = Object.getOwnPropertySymbols(privateKey);
    const k = (privateKey as any)[keys[0]];
    // --

    return signers.newPrivateKeySigner(k as any);
  }

  private static async extractPrivateKey(pem: Buffer) {
    const libName = "crypto";
    let subtle: any;
    if (globalThis.window && (globalThis.window as { Crypto: any }).Crypto) {
      subtle = (globalThis.Crypto as any).subtle;
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
