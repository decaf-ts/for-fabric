import { Signer } from "@hyperledger/fabric-gateway";
import pkcs11 from "pkcs11js";
import { HSMOptions, normalizeImport } from "../shared/index";
import { Extension, X509Certificate } from "@peculiar/x509";

type CurveInfo = { name: "P-256" | "P-384"; n: bigint; sizeBytes: number };
const OID_P256 = "06082A8648CE3D030107"; // 1.2.840.10045.3.1.7
const OID_P384 = "06052B81040022"; // 1.3.132.0.34

function curveFromEcParams(ecParams: Buffer): CurveInfo {
  const hex = ecParams.toString("hex").toUpperCase();
  if (hex.includes(OID_P256)) {
    return {
      name: "P-256",
      n: BigInt(
        "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
      ),
      sizeBytes: 32,
    };
  }
  if (hex.includes(OID_P384)) {
    return {
      name: "P-384",
      n: BigInt(
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFC7634D81F4372DDF581A0DB248B0A77AECEC196ACCC52973"
      ),
      sizeBytes: 48,
    };
  }
  throw new Error("Unsupported EC curve (expect P-256 or P-384)");
}

function ecdsaRsToDerLowS(raw: Buffer, curve: CurveInfo): Buffer {
  if (raw.length !== 2 * curve.sizeBytes) {
    throw new Error(
      `Unexpected raw sig length ${raw.length}, expected ${2 * curve.sizeBytes}`
    );
  }
  const r = BigInt("0x" + raw.slice(0, curve.sizeBytes).toString("hex"));
  let s = BigInt("0x" + raw.slice(curve.sizeBytes).toString("hex"));
  if (s > curve.n >> BigInt(1)) s = curve.n - s;

  const enc = (x: bigint, len: number) => {
    let h = x.toString(16);
    if (h.length % 2) h = "0" + h;
    let b = Buffer.from(h, "hex");
    if (b.length < len) b = Buffer.concat([Buffer.alloc(len - b.length, 0), b]);
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
    return b;
  };
  const rEnc = enc(r, curve.sizeBytes);
  const sEnc = enc(s, curve.sizeBytes);
  const seqLen = 2 + rEnc.length + 2 + sEnc.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rEnc.length]),
    rEnc,
    Buffer.from([0x02, sEnc.length]),
    sEnc,
  ]);
}

function getSlotHandle(
  p11: pkcs11.PKCS11,
  tokenLabel?: string,
  slotIndex?: number
): Buffer {
  const slots: Buffer[] = p11.C_GetSlotList(true); // -> Buffer[] handles
  if (!slots.length) throw new Error("No tokens found");
  if (typeof slotIndex === "number") {
    if (slotIndex < 0 || slotIndex >= slots.length)
      throw new Error(`slotIndex ${slotIndex} out of range`);
    return slots[slotIndex];
  }
  if (tokenLabel) {
    for (const s of slots) {
      const info = p11.C_GetTokenInfo(s);
      if (info.label?.trim() === tokenLabel) return s;
    }
    throw new Error(`Token label "${tokenLabel}" not found`);
  }
  return slots[0];
}

function findPrivateKey(
  p11: pkcs11.PKCS11,
  session: Buffer,
  keyLabel?: string,
  keyIdHex?: string
): Buffer {
  const template: pkcs11.Template = [
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
    { type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_EC },
  ];
  if (keyLabel) template.push({ type: pkcs11.CKA_LABEL, value: keyLabel });
  if (keyIdHex)
    template.push({ type: pkcs11.CKA_ID, value: Buffer.from(keyIdHex, "hex") });

  p11.C_FindObjectsInit(session, template);
  const objs = p11.C_FindObjects(session, 1);
  p11.C_FindObjectsFinal(session);
  if (!objs.length) throw new Error("HSM private key not found");
  return objs[0];
}

export function getPkcs11Signer(options: HSMOptions): {
  signer: Signer;
  close: () => void;
} {
  const p11 = new pkcs11.PKCS11();
  p11.load(options.library);
  p11.C_Initialize();

  const slot = getSlotHandle(p11, options.tokenLabel, options.slot);
  const session = p11.C_OpenSession(
    slot,
    pkcs11.CKF_SERIAL_SESSION | pkcs11.CKF_RW_SESSION
  ); // slot/session are Buffer
  p11.C_Login(session, pkcs11.CKU_USER, options.pin);

  const privKey = findPrivateKey(
    p11,
    session,
    options.keyLabel,
    options.keyIdHex
  );

  // ✅ Correct way to read attributes: TemplateResult is an array
  const res = p11.C_GetAttributeValue(session, privKey, [
    { type: pkcs11.CKA_EC_PARAMS },
  ]);
  const ecParams = res[0].value as Buffer;
  const curve = curveFromEcParams(ecParams);

  const signer: Signer = async (digest: Uint8Array): Promise<Uint8Array> => {
    p11.C_SignInit(session, { mechanism: pkcs11.CKM_ECDSA }, privKey);
    const out = Buffer.alloc(2 * curve.sizeBytes); // raw r||s
    const raw = p11.C_Sign(session, Buffer.from(digest), out); // returns sliced Buffer
    const der = ecdsaRsToDerLowS(raw, curve); // DER + low-S for Fabric
    return new Uint8Array(der);
  };

  const close = () => {
    try {
      p11.C_Logout(session);
    } catch {
      // do nothing
    }
    try {
      p11.C_CloseSession(session);
    } catch {
      // do nothing
    }
    try {
      p11.C_Finalize();
    } catch {
      // do nothing
    }
  };

  return { signer, close };
}

export async function extractIdentifierFromCert(dirPath: string) {
  const SUBJECT_KEY_IDENTIFIER = "2.5.29.14";

  const { promises } = await normalizeImport(import("fs"));
  const { join } = await normalizeImport(import("path"));
  const files = await promises.readdir(dirPath);
  const certPath = join(dirPath, files[0]);
  const pem = await promises.readFile(certPath);
  const cert = new X509Certificate(pem);

  const keyIdentifier = cert.extensions
    .map((e: Extension) => ({
      oid: e.type,
      value: Buffer.from(e.value).toString("hex"),
    }))
    .find((e) => e.oid === SUBJECT_KEY_IDENTIFIER);

  if (!keyIdentifier || !keyIdentifier.value) throw new Error();

  return Buffer.from(
    Buffer.from(keyIdentifier!.value, "hex").subarray(2).toString("hex"),
    "hex"
  );
}
