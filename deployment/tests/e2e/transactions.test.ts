import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { convertToMS } from "../utils";

jest.setTimeout(convertToMS(300));

const environmentDir = path.join(__dirname, "../environment");

// Organizations taking part in the transaction flow:
// orga (boot infrastructure, .env.pla) plus the onboarded partners.
const orgEnvFiles = (
  process.env.TRANSACTION_ORGS || ".env.pla,.env.onboard.orgb,.env.onboard.orgc"
).split(",");

function readEnvFile(file: string): Record<string, string> {
  const content = fs.readFileSync(path.join(environmentDir, file), "utf8");
  const values: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = /^\s*#?\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && !line.trimStart().startsWith("#")) {
      values[match[1]] = match[2].trim().replace(/^"|"$/g, "");
    }
  }
  return values;
}

interface OrgConfig {
  name: string;
  peerContainer: string;
  peerPort: number;
  ordererCaFile: string;
  peerTlsCaFile: string;
}

function loadOrg(envFile: string): OrgConfig {
  const values = readEnvFile(envFile);
  const name = values.ORG_NAME;
  if (!name) throw new Error(`ORG_NAME missing in ${envFile}`);
  // orga's peers trust the shared TLS CA chain; onboarded partners got the
  // orderer's TLS intermediate copied to a fixed location during onboarding.
  const ordererCaFile = envFile.endsWith(".env.pla")
    ? "/etc/hyperledger/shared/tls-cert.pem"
    : "/etc/hyperledger/fabric/orderer-tls.pem";
  return {
    name,
    peerContainer: `${name}-peer-0`,
    peerPort: parseInt(values.PEER0__PORT, 10),
    ordererCaFile,
    peerTlsCaFile: `/etc/hyperledger/shared/${name}-tls.pem`,
  };
}

const plaEnv = readEnvFile(".env.pla");
const ordererAddress = `orga-orderer-0:${plaEnv.ORDERER0__PORT}`;
const channel = plaEnv.CHANNEL__NAME;
const chaincode = plaEnv.CONTRACT__NAME;

const orgs = orgEnvFiles.map(loadOrg);
const [orga, orgb, orgc] = orgs;

// Every contract is registered under its own @Info title, so transaction
// names are prefixed with the contract name to avoid relying on the
// chaincode's default contract resolution.
const PRODUCT_CONTRACT = "OtherProductContract";

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Each org's peer TLS certificate is signed by that org's own TLS CA, so
 * connecting from one org's peer container to another requires the target
 * org's TLS CA chain. Copies each org's chain (intermediate + root) into
 * every peer container under /etc/hyperledger/shared/<org>-tls.pem.
 */
function ensureCrossOrgTls(): void {
  for (const target of orgs) {
    for (const org of orgs) {
      const dest = `/etc/hyperledger/shared/${org.name}-tls.pem`;
      const exists = execSync(
        `docker exec ${target.peerContainer} sh -c "test -f ${dest} && echo yes || echo no"`,
        { encoding: "utf8" }
      ).trim();
      if (exists === "yes") continue;
      const chain = execSync(
        `docker exec ${org.peerContainer} sh -c "cat /etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/*.pem /etc/hyperledger/fabric/tls/msp/tlscacerts/*.pem"`,
        { encoding: "utf8", maxBuffer: 1 << 20 }
      );
      const tmp = path.join("/tmp", "opencode", `${org.name}-tls.pem`);
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.writeFileSync(tmp, chain);
      execSync(`docker cp ${tmp} ${target.peerContainer}:${dest}`);
    }
  }
}

function execInPeer(
  org: OrgConfig,
  command: string,
  failOn_stderr = true
): string {
  try {
    return execSync(
      `docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp ` +
        `${org.peerContainer} ${command}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (e: unknown) {
    const error = e as { stderr?: Buffer; stdout?: Buffer; message: string };
    const output = `${error.stdout?.toString() || ""}${error.stderr?.toString() || ""}`;
    if (failOn_stderr) {
      throw new Error(
        `Command failed on ${org.peerContainer}: ${command}\n${output}`
      );
    }
    return output;
  }
}

function chaincodeArgs(org: OrgConfig, fn: string, args: unknown[]): string {
  const serialized = args.map((arg) =>
    typeof arg === "string" ? arg : JSON.stringify(arg)
  );
  const json = JSON.stringify({ Args: [`${fn}`, ...serialized] });
  return shellEscape(json);
}

function invoke(submitter: OrgConfig, fn: string, args: unknown[]): void {
  // Two endorsement layers must be satisfied:
  // 1. The channel Application/Endorsement policy
  //    OutOf(2, 'OrgaMSP.peer', 'OrgaMSP.peer'): requires signatures from
  //    two orga peers, regardless of which org submits the transaction.
  // 2. The private data collection endorsement policies (e.g.
  //    decaf-namespaceOrgbMSP = AND('OrgbMSP.peer','PharmaledgerassocMSP.peer')):
  //    writes touching collections owned by the submitter org require one of
  //    that org's peers to endorse as well.
  const peerFlags = [
    `--peerAddresses ${orga.name}-peer-0:${orga.peerPort} --tlsRootCertFiles ${orga.peerTlsCaFile}`,
    `--peerAddresses ${orga.name}-peer-1:${plaEnv.PEER1__PORT} --tlsRootCertFiles ${orga.peerTlsCaFile}`,
    ...(submitter.name !== orga.name
      ? [
          `--peerAddresses localhost:${submitter.peerPort} --tlsRootCertFiles ${submitter.peerTlsCaFile}`,
        ]
      : []),
  ].join(" ");
  execInPeer(
    submitter,
    `peer chaincode invoke -C ${channel} -n ${chaincode} ` +
      `-o ${ordererAddress} --tls --cafile ${submitter.ordererCaFile} ` +
      `${peerFlags} ` +
      `--connTimeout 30s --waitForEvent ` +
      `-c ${chaincodeArgs(submitter, fn, args)}`
  );
}

function query(org: OrgConfig, fn: string, args: unknown[]): string {
  return execInPeer(
    org,
    `peer chaincode query -C ${channel} -n ${chaincode} ` +
      `--peerAddresses localhost:${org.peerPort} --tlsRootCertFiles ${org.peerTlsCaFile} ` +
      `-c ${chaincodeArgs(org, fn, args)}`
  ).trim();
}

function tryQuery(org: OrgConfig, fn: string, args: unknown[]): string | null {
  const output = execInPeer(
    org,
    `peer chaincode query -C ${channel} -n ${chaincode} ` +
      `--peerAddresses localhost:${org.peerPort} --tlsRootCertFiles ${org.peerTlsCaFile} ` +
      `-c ${chaincodeArgs(org, fn, args)}`,
    false
  );
  if (/Error/i.test(output)) return null;
  return output.trim();
}

/**
 * Generates a random valid GTIN (14 digits including the GS1 check digit),
 * so every run creates a fresh OtherProduct and stays idempotent.
 */
function generateGtin(): string {
  const beforeChecksum = (
    Math.floor(Math.random() * 9999999999999) + ""
  ).padStart(13, "0");
  const multiplier = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
  const sum = beforeChecksum
    .split("")
    .reduce((acc, digit, i) => acc + parseInt(digit, 10) * multiplier[i], 0);
  const remainder = sum % 10;
  const checksum = remainder === 0 ? 0 : 10 - remainder;
  return `${beforeChecksum}${checksum}`;
}

interface OtherProduct {
  productCode: string;
  inventedName: string;
  nameMedicinalProduct: string;
  productRecall?: boolean;
  counter?: number;
  ownedBy?: string;
}

describe("E2E Transactions", () => {
  beforeAll(() => {
    ensureCrossOrgTls();
  });

  it("Performs transactions on " + orgs.map((o) => o.name).join(", "), () => {
    const productCode = generateGtin();
    const product: OtherProduct = {
      productCode,
      inventedName: "E2E Invented",
      nameMedicinalProduct: "E2E Medicinal",
      productRecall: false,
    };

    // STEP-1 orgb creates an OtherProduct record.
    // Writes must be submitted by a partner org: orga owns the mirror
    // collection (PharmaledgerassocMSP) and is not authorized to modify
    // mirrored data. The contract's DeterministicSerializer requires the
    // __model class anchor to rebuild the model instance from the payload.
    invoke(orgb, `${PRODUCT_CONTRACT}:create`, [
      JSON.stringify({ ...product, __model: "OtherProduct" }),
    ]);
    const created = JSON.parse(
      query(orgb, `${PRODUCT_CONTRACT}:read`, [productCode])
    ) as OtherProduct;
    expect(created.productCode).toBe(productCode);
    expect(created.inventedName).toBe(product.inventedName);
    expect(created.ownedBy).toBeDefined();
    expect(created.counter).toBeDefined();

    // STEP-2 orga and orgc read orgb's record from their own peers (same ledger)
    const orgaRead = JSON.parse(
      query(orga, `${PRODUCT_CONTRACT}:read`, [productCode])
    ) as OtherProduct;
    expect(orgaRead).toEqual(created);
    const orgcRead = JSON.parse(
      query(orgc, `${PRODUCT_CONTRACT}:read`, [productCode])
    ) as OtherProduct;
    expect(orgcRead).toEqual(created);

    // STEP-3 orgc submits an update; orga reads it back
    const updatedModel: OtherProduct = {
      ...orgcRead,
      inventedName: "E2E Invented Updated",
    };
    invoke(orgc, `${PRODUCT_CONTRACT}:update`, [JSON.stringify(updatedModel)]);
    const afterUpdate = JSON.parse(
      query(orga, `${PRODUCT_CONTRACT}:read`, [productCode])
    ) as OtherProduct;
    expect(afterUpdate.inventedName).toBe("E2E Invented Updated");
    // the version counter is incremented on update
    expect(afterUpdate.counter).toBe((updatedModel.counter || 0) + 1);

    // STEP-4 orgb deletes the record; every org sees it gone
    invoke(orgb, `${PRODUCT_CONTRACT}:delete`, [productCode]);
    expect(
      tryQuery(orga, `${PRODUCT_CONTRACT}:read`, [productCode])
    ).toBeNull();
    expect(
      tryQuery(orgb, `${PRODUCT_CONTRACT}:read`, [productCode])
    ).toBeNull();
    expect(
      tryQuery(orgc, `${PRODUCT_CONTRACT}:read`, [productCode])
    ).toBeNull();
  });
});
