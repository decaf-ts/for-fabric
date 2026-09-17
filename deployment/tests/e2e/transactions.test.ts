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
  const json = JSON.stringify({ Args: [fn, ...serialized] });
  return shellEscape(json);
}

function invoke(org: OrgConfig, fn: string, args: unknown[]): void {
  // The channel default endorsement policy is MAJORITY Endorsement: with
  // three orgs on the channel every invoke must be endorsed by two of them.
  const endorsers = [
    org,
    ...orgs.filter((o) => o.name !== org.name).slice(0, 1),
  ];
  const peerFlags = endorsers
    .map(
      (e) =>
        // docker-network addresses (resolvable + present in the peer TLS
        // cert SANs); localhost:<port> only exists on the docker host.
        `--peerAddresses ${e.peerContainer}:${e.peerPort} --tlsRootCertFiles ${e.peerTlsCaFile}`
    )
    .join(" ");
  execInPeer(
    org,
    `peer chaincode invoke -C ${channel} -n ${chaincode} ` +
      `-o ${ordererAddress} --tls --cafile ${org.ordererCaFile} ` +
      `${peerFlags} ` +
      `--connTimeout 30s --waitForEvent ` +
      `-c ${chaincodeArgs(org, fn, args)}`
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

function balance(org: OrgConfig, owner: string): number {
  const result = tryQuery(org, "BalanceOf", [owner]);
  if (result === null) return 0;
  return parseInt(result, 10);
}

const TOKEN = {
  name: "decaf-e2e-token",
  symbol: "DET",
  decimals: 2,
};

describe("E2E Transactions", () => {
  beforeAll(() => {
    ensureCrossOrgTls();
  });

  it("Performs transactions on " + orgs.map((o) => o.name).join(", "), () => {
    // STEP-1 orga initializes the token (skipped if already initialized)
    if (tryQuery(orga, "CheckInitialized", []) === null) {
      invoke(orga, "Initialize", [TOKEN]);
    }
    expect(tryQuery(orga, "CheckInitialized", [])).toBeDefined();

    // STEP-2 orga mints and owns the initial supply
    const orgaId = query(orga, "ClientAccountID", []);
    const orgaBeforeMint = balance(orga, orgaId);
    invoke(orga, "Mint", [1000]);
    expect(balance(orga, orgaId)).toBe(orgaBeforeMint + 1000);

    // STEP-3 orgb reads orga's balance from its own peer (same ledger)
    const orgbId = query(orgb, "ClientAccountID", []);
    const orgcId = query(orgc, "ClientAccountID", []);
    expect(balance(orgb, orgaId)).toBe(orgaBeforeMint + 1000);

    // STEP-4 orga approves allowances for orgb and orgc
    invoke(orga, "Approve", [orgbId, 500]);
    invoke(orga, "Approve", [orgcId, 200]);

    // STEP-5 orgb submits a transfer from orga's allowance
    const orgbBefore = balance(orgb, orgbId);
    invoke(orgb, "TransferFrom", [orgaId, orgbId, 500]);
    expect(balance(orgc, orgbId)).toBe(orgbBefore + 500);

    // STEP-6 orgc submits a transfer from orga's allowance
    const orgcBefore = balance(orgc, orgcId);
    invoke(orgc, "TransferFrom", [orgaId, orgcId, 200]);
    expect(balance(orga, orgcId)).toBe(orgcBefore + 200);

    // STEP-7 final balances: orga spent 700 of the minted tokens
    expect(balance(orga, orgaId)).toBe(orgaBeforeMint + 1000 - 500 - 200);
    expect(balance(orgb, orgbId)).toBe(orgbBefore + 500);
    expect(balance(orgc, orgcId)).toBe(orgcBefore + 200);
    expect(parseInt(query(orga, "TotalSupply", []), 10)).toBe(
      orgaBeforeMint + orgbBefore + orgcBefore + 1000
    );
  });
});
