import pkcs11 from "pkcs11js";
import fs from "fs";
import path from "path";
import { MissingPKCSS11Lib } from "../shared/errors";
import crypto from "crypto";
import nist from "@noble/curves/nist";
export class HSMSignerFactoryCustom {
  static #pkcs11: pkcs11.PKCS11 | null = null;
  static #initialized = false;

  constructor(library: string) {
    if (!HSMSignerFactoryCustom.#pkcs11) {
      HSMSignerFactoryCustom.#pkcs11 = new pkcs11.PKCS11();
      HSMSignerFactoryCustom.#pkcs11.load(this.findHSMPKCS11Lib(library));
    }

    if (!HSMSignerFactoryCustom.#initialized) {
      try {
        HSMSignerFactoryCustom.#pkcs11.C_Initialize();
      } catch (e: unknown) {
        // ignore "already initialized" if tests / hot reloads cause reuse
        if ((e as any).code !== pkcs11.CKR_CRYPTOKI_ALREADY_INITIALIZED) {
          throw e;
        }
      }
      HSMSignerFactoryCustom.#initialized = true;
    }
  }

  private findHSMPKCS11Lib(lib?: string): string {
    const commonSoftHSMPathNames = [
      "/usr/lib/softhsm/libsofthsm2.so",
      "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so",
      "/usr/local/lib/softhsm/libsofthsm2.so",
      "/usr/lib/libacsp-pkcs11.so",
      "/opt/homebrew/lib/softhsm/libsofthsm2.so",
    ];

    if (lib) commonSoftHSMPathNames.push(lib);

    for (const pathnameToTry of commonSoftHSMPathNames) {
      if (fs.existsSync(pathnameToTry)) {
        return pathnameToTry;
      }
    }

    throw new MissingPKCSS11Lib("Unable to find PKCS11 library");
  }

  dispose() {
    HSMSignerFactoryCustom.#pkcs11!.C_Finalize();
  }

  private sanitizeOptions(hsmSignerOptions: HSMConfig) {
    const options = Object.assign(
      {
        userType: pkcs11.CKU_USER,
      },
      hsmSignerOptions
    );
    this.assertNotEmpty(options.label, "label");
    this.assertNotEmpty(options.pin, "pin");
    this.assertNotEmpty(options.identifier as unknown as string, "identifier");
    return options;
  }

  private assertNotEmpty(property: string, name: string) {
    if (!property || property.toString().trim().length === 0) {
      throw new Error(`${name} property must be provided`);
    }
  }

  private findSlotForLabel(pkcs11Label: string) {
    const slots = (
      HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11
    ).C_GetSlotList(true);
    if (slots.length === 0) {
      throw new Error("No pkcs11 slots can be found");
    }
    const slot = slots.find((slotToCheck) => {
      const tokenInfo = (
        HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11
      ).C_GetTokenInfo(slotToCheck);
      return tokenInfo.label.trim() === pkcs11Label;
    });
    if (!slot) {
      throw new Error(
        `label ${pkcs11Label} cannot be found in the pkcs11 slot list`
      );
    }
    return slot;
  }

  private login(session: pkcs11.Handle, userType: number, pin: string) {
    try {
      (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_Login(
        session,
        userType,
        pin
      );
    } catch (err: unknown) {
      const pkcs11err = err as { code: number };
      if (pkcs11err.code !== pkcs11.CKR_USER_ALREADY_LOGGED_IN) {
        throw err;
      }
    }
  }

  private findObjectInHSM(
    session: pkcs11.Handle,
    keytype: number,
    identifier: any
  ) {
    const pkcs11Template = [
      { type: pkcs11.CKA_ID, value: identifier },
      { type: pkcs11.CKA_CLASS, value: keytype },
      { type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_EC },
    ];

    (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_FindObjectsInit(
      session,
      pkcs11Template
    );
    const hsmObject = (
      HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11
    ).C_FindObjects(session, 1)[0];
    if (!hsmObject) {
      (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_FindObjectsFinal(
        session
      );
      throw new Error(
        `Unable to find object in HSM with ID ${identifier.toString()}`
      );
    }
    (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_FindObjectsFinal(
      session
    );
    return hsmObject;
  }

  newSigner(hsmSignerOptions: HSMConfig) {
    const options = this.sanitizeOptions(hsmSignerOptions);
    const pkcs = HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11;
    const slot = this.findSlotForLabel(options.label);
    const session = pkcs.C_OpenSession(slot, pkcs11.CKF_SERIAL_SESSION);
    let privateKeyHandle;
    try {
      this.login(session, options.userType, options.pin);
      privateKeyHandle = this.findObjectInHSM(
        session,
        pkcs11.CKO_PRIVATE_KEY,
        options.identifier
      );
    } catch (err) {
      (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_CloseSession(session);
      throw err;
    }
    return {
      signer: async (digest: any) => {
        (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_SignInit(
          session,
          { mechanism: pkcs11.CKM_ECDSA },
          privateKeyHandle
        );
        const compactSignature = await (
          HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11
        ).C_SignAsync(
          session,
          Buffer.from(digest),
          // EC signatures have length of 2n according to the PKCS11 spec:
          // https://docs.oasis-open.org/pkcs11/pkcs11-spec/v3.1/pkcs11-spec-v3.1.html
          Buffer.alloc(nist.p256.Point.Fn.BYTES * 2)
        );
        return nist.p256.Signature.fromBytes(compactSignature, "compact")
          .normalizeS()
          .toBytes("der");
      },
      close: () => {
        (HSMSignerFactoryCustom.#pkcs11 as pkcs11.PKCS11).C_CloseSession(
          session
        );
      },
    };
  }

  private assertDefined<T>(value: T | undefined): T {
    if (value === undefined) {
      throw new Error("required value was undefined");
    }

    return value;
  }

  private getUncompressedPointOnCurve(key: crypto.KeyObject): Buffer {
    const jwk = key.export({ format: "jwk" });
    const x = Buffer.from(this.assertDefined(jwk.x), "base64url");
    const y = Buffer.from(this.assertDefined(jwk.y), "base64url");
    const prefix = Buffer.from("04", "hex");
    return Buffer.concat([prefix, x, y]);
  }

  getSKIFromCertificate(certPath: string): Buffer {
    const p = certPath.endsWith(".pem")
      ? certPath
      : path.join(certPath, "cert.pem");
    const credentials = fs.readFileSync(p);

    const certificate = new crypto.X509Certificate(credentials);
    const uncompressedPoint = this.getUncompressedPointOnCurve(
      certificate.publicKey
    );

    return crypto.createHash("sha256").update(uncompressedPoint).digest();
  }
}

export interface HSMConfig {
  label: string;
  identifier: Buffer<ArrayBufferLike>;
  pin: string;
}
