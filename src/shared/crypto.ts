import * as x509 from "@peculiar/x509";
import { Crypto, CryptoKey } from "@peculiar/webcrypto";
import { stringFormat } from "@decaf-ts/decorator-validation";
import { isBrowser, Logging } from "@decaf-ts/logging";

const crypto = new Crypto();
x509.cryptoProvider.set(crypto);

export enum BASE_ALPHABET {
  BASE2 = "01",
  BASE8 = "01234567",
  BASE11 = "0123456789a",
  BASE16 = "0123456789abcdef",
  BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  BASE32_Z = "ybndrfg8ejkmcpqxot1uwisza345h769",
  BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz",
  BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  BASE67 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~",
}

export type keyObject = {
  iv: ArrayBuffer;
  key: CryptoKey;
};

export enum CRYPTO {
  HASH = "SHA-256",
  ITERATIONS = 1000,
  KEYLENGTH = 48,
  DERIVED_IV_LENGTH = 16,
  DERIVED_KEY_LENGTH = 32, // Because SHA-256 used has a native size of 32 bytes
  ALGORYTHM = "AES-GCM",
  KEY_ALGORYTHM = "PBKDF2",
}

export class BaseEncoder {
  private readonly baseMap: Uint8Array = new Uint8Array(256);
  private readonly base: number;
  private readonly leader: string;
  private readonly factor: number;
  private readonly iFactor: number;

  constructor(private alphabet: BASE_ALPHABET) {
    if (this.alphabet.length >= 255) throw new Error("Alphabet too long");

    for (let j = 0; j < this.baseMap.length; j++) this.baseMap[j] = 255;

    for (let i = 0; i < alphabet.length; i++) {
      const x = alphabet.charAt(i);
      const xc = x.charCodeAt(0);
      if (this.baseMap[xc] !== 255) throw new Error(x + " is ambiguous");

      this.baseMap[xc] = i;
    }

    this.base = this.alphabet.length;
    this.leader = this.alphabet.charAt(0);
    this.factor = Math.log(this.base) / Math.log(256); // log(BASE) / log(256), rounded up
    this.iFactor = Math.log(256) / Math.log(this.base); // log(256) / log(BASE), rounded up
  }

  encode(source: Uint8Array | DataView | any[] | string) {
    if (typeof source === "string") {
      source = Buffer.from(source);
    } else if (ArrayBuffer.isView(source)) {
      source = new Uint8Array(
        source.buffer,
        source.byteOffset,
        source.byteLength
      );
    } else if (Array.isArray(source)) {
      source = Uint8Array.from(source);
    }

    if (source.length === 0) return "";

    // Skip & count leading zeroes.
    let zeroes = 0;
    let length = 0;
    let pbegin = 0;
    const pend = source.length;
    while (pbegin !== pend && source[pbegin] === 0) {
      pbegin++;
      zeroes++;
    }
    // Allocate enough space in big-endian base58 representation.
    const size = ((pend - pbegin) * this.iFactor + 1) >>> 0;
    const b58 = new Uint8Array(size);
    // Process the bytes.
    while (pbegin !== pend) {
      let carry = source[pbegin];
      // Apply "b58 = b58 * 256 + ch".
      let i = 0;
      for (
        let it1 = size - 1;
        (carry !== 0 || i < length) && it1 !== -1;
        it1--, i++
      ) {
        carry += (256 * b58[it1]) >>> 0;
        b58[it1] = carry % this.base >>> 0;
        carry = (carry / this.base) >>> 0;
      }
      if (carry !== 0) throw new Error("Non-zero carry");

      length = i;
      pbegin++;
    }
    // Skip leading zeroes in base58 result.
    let it2 = size - length;
    while (it2 !== size && b58[it2] === 0) it2++;

    // Translate the result into a string.
    let str = this.leader.repeat(zeroes);
    for (; it2 < size; ++it2) {
      str += this.alphabet.charAt(b58[it2]);
    }
    return str;
  }

  private decodeUnsafe(source: string): Uint8Array | undefined {
    if (source.length === 0) return new Uint8Array(0);

    let psz = 0;
    // Skip and count leading '1's.
    let zeroes = 0;
    let length = 0;
    while (source[psz] === this.leader) {
      zeroes++;
      psz++;
    }
    // Allocate enough space in big-endian base256 representation.
    const size = ((source.length - psz) * this.factor + 1) >>> 0; // log(58) / log(256), rounded up.
    const b256 = new Uint8Array(size);
    // Process the characters.
    while (source[psz]) {
      // Decode character
      let carry = this.baseMap[source.charCodeAt(psz)];
      // Invalid character
      if (carry === 255) return;

      let i = 0;
      for (
        let it3 = size - 1;
        (carry !== 0 || i < length) && it3 !== -1;
        it3--, i++
      ) {
        carry += (this.base * b256[it3]) >>> 0;
        b256[it3] = carry % 256 >>> 0;
        carry = (carry / 256) >>> 0;
      }
      if (carry !== 0) throw new Error("Non-zero carry");

      length = i;
      psz++;
    }
    // Skip leading zeroes in b256.
    let it4 = size - length;
    while (it4 !== size && b256[it4] === 0) it4++;

    const vch = new Uint8Array(zeroes + (size - it4));
    let j = zeroes;
    while (it4 !== size) vch[j++] = b256[it4++];

    return vch;
  }

  decode(source: string) {
    const buffer = this.decodeUnsafe(source);
    if (buffer) return buffer;
    throw new Error("Non-base" + this.base + " character");
  }
}

export class CryptoUtils {
  private static readonly b58encoder = new BaseEncoder(BASE_ALPHABET.BASE58);
  private static readonly logger = Logging.for(CryptoUtils.name);
  private constructor() {}

  static fabricIdFromCertificate(certificate: string) {
    this.logger.debug(stringFormat("Parsing certificate: {0}", certificate));
    const cert = new x509.X509Certificate(certificate);
    const { subject, issuer } = cert;
    this.logger.debug(
      stringFormat(
        "Certificate parsed with subject {0} and issuer {1}",
        subject,
        issuer
      )
    );
    return `x509::/${subject.replaceAll(", ", "/")}::/${issuer.replaceAll(", ", "/")}`;
  }

  static encode(str: string): string {
    return this.b58encoder.encode(str);
  }
  static decode(str: string): string {
    const decoded = this.b58encoder.decode(str);
    const result = new TextDecoder().decode(decoded);
    return result;
  }

  static stringToArrayBuffer(str: string) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  private static async extractKey(
    type: "private" | "public",
    pem: Buffer | string,
    usages?: any[]
  ) {
    const subtle = crypto.subtle;

    const str = pem
      .toString("utf8")
      .replace(
        new RegExp(`-----BEGIN (${type.toUpperCase()} KEY|CERTIFICATE)-----`),
        ""
      )
      .replaceAll("\n", "")
      .replace(
        new RegExp(`-----END (${type.toUpperCase()} KEY|CERTIFICATE)-----`),
        ""
      );
    const decoded = Buffer.from(str, "base64").toString("binary");
    const binaryDer = this.stringToArrayBuffer(decoded);
    const key = await subtle.importKey(
      "pkcs8",
      binaryDer,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      usages ? usages : ["sign"]
    );

    return key;
  }

  static async extractPrivateKey(pem: Buffer | string, usages?: any[]) {
    return this.extractKey("private", pem, usages);
  }

  static async extractPublicKey(pem: Buffer | string, usages?: any[]) {
    return this.extractKey("public", pem, usages);
  }

  static async sign(privateKey: string, data: Buffer): Promise<string> {
    const key = await this.extractPrivateKey(privateKey);
    const buff = (await crypto.subtle.sign(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      key,
      data
    )) as ArrayBuffer;

    return Array.from(new Uint8Array(buff))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  static async verify(
    certificate: string,
    signature: Buffer | string,
    data: Buffer | string
  ): Promise<boolean> {
    const cert = new x509.X509Certificate(certificate);
    const key = await cert.publicKey.export();
    signature = (
      typeof signature === "string" ? Buffer.from(signature, "hex") : signature
    ) as Buffer;
    data = (typeof data === "string" ? Buffer.from(data) : data) as Buffer;
    return crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      key,
      signature,
      data
    );
  }

  static async encrypt(certificate: string, data: string | Buffer) {
    const cert = new x509.X509Certificate(certificate);
    const key = await cert.publicKey.export();
    data = (typeof data === "string" ? Buffer.from(data) : data) as Buffer;
    const buff = await this.getSubtleCrypto().encrypt(
      {
        name: "ECDSA",
      },
      key,
      data
    );

    return Array.from(new Uint8Array(buff))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private static getSubtleCrypto() {
    return isBrowser()
      ? (globalThis as any).window.crypto.subtle
      : crypto.subtle;
  }

  static async decrypt(privateKey: string, data: string | Buffer) {
    const key = await this.extractPrivateKey(privateKey);
    data = (
      typeof data === "string" ? Buffer.from(data, "hex") : data
    ) as Buffer;
    return this.getSubtleCrypto().decrypt(
      {
        name: "ECDSA",
      },
      key,
      data
    );
  }

  /**
   * @summary Util function to get a random master key
   *
   * @description If data is not passed, a random ArrayBuffer will be generated
   *
   * @param {ArrayBuffer} data encrytion data
   *
   * @function getMaster
   */
  static async getMaster(data?: ArrayBuffer): Promise<keyObject> {
    const textEncoder = new TextEncoder();
    if (data === undefined) {
      const genGenesis = crypto.randomUUID();
      data = textEncoder.encode(genGenesis).buffer;
    }

    const importedKey = await this.getSubtleCrypto().importKey(
      "raw",
      data,
      CRYPTO.KEY_ALGORYTHM as string,
      false,
      ["deriveBits"]
    );

    return {
      key: importedKey,
      iv: data!,
    };
  }

  /**
   * @summary Util function to derive a key from another key
   *
   * @param {string} salt
   * @param {CryptoKey} key Original key
   *
   * @function getDerivationKey
   */
  static async getDerivationKey(salt: string, key: CryptoKey) {
    const textEncoder = new TextEncoder();
    const saltBuffer = textEncoder.encode(salt);
    const saltHashed = await this.getSubtleCrypto().digest(
      "SHA-256",
      saltBuffer
    );
    const params = {
      name: CRYPTO.KEY_ALGORYTHM as string,
      hash: CRYPTO.HASH,
      salt: saltHashed,
      iterations: CRYPTO.ITERATIONS,
    };
    const derivation = await this.getSubtleCrypto().deriveBits(
      params,
      key,
      CRYPTO.KEYLENGTH * 8
    );
    return this.getKey(derivation);
  }

  /**
   * @summary Util function to get the key and IV from the CrytoKey array
   *
   * @param {ArrayBuffer} derivation
   *
   * @function getKey
   */
  static async getKey(derivation: ArrayBuffer) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ivlen = 16;
    const keylen = 32;
    const derivedKey = derivation.slice(0, keylen);
    const iv = derivation.slice(keylen);
    const importedEncryptionKey = await this.getSubtleCrypto().importKey(
      "raw",
      derivedKey,
      { name: CRYPTO.ALGORYTHM as string },
      false,
      ["encrypt", "decrypt"]
    );
    return {
      key: importedEncryptionKey,
      iv: iv,
    };
  }

  /**
   * @summary Util function to decrypt data
   *
   * @param {string} text
   * @param {keyObject} keyObject
   *
   * @function encrypt
   */
  static async encryptPin(
    text: string,
    keyObject: keyObject
  ): Promise<ArrayBuffer> {
    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(text);
    const encryptedText = await this.getSubtleCrypto().encrypt(
      { name: CRYPTO.ALGORYTHM as string, iv: keyObject.iv },
      keyObject.key,
      textBuffer
    );
    return encryptedText;
  }

  /**
   * @summary Util function to decrypt data
   *
   * @param {BufferSource} encryptedText
   * @param {keyObject} keyObject
   *
   * @function decrypt
   */
  static async decryptPin(
    encryptedText: ArrayBuffer,
    keyObject: keyObject
  ): Promise<string> {
    const textDecoder = new TextDecoder();
    const decryptedText = await this.getSubtleCrypto().decrypt(
      { name: CRYPTO.ALGORYTHM as string, iv: keyObject.iv },
      keyObject.key,
      encryptedText
    );
    return textDecoder.decode(decryptedText);
  }
}
