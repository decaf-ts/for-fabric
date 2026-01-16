import { OrderDirection } from "@decaf-ts/core";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";

export type Index = {
  index: {
    fields: string[] | { [k: string]: OrderDirection };
  };
  ddoc?: string;
  name: string;
  type: "json";
};
//
// export type FabricCollection = {
//   name: "collectionMarbles";
//   policy: "OR('Org1MSP.member', 'Org2MSP.member')";
//   requiredPeerCount: 0;
//   maxPeerCount: 3;
//   blockToLive: 0;
//   memberOnlyRead: true;
//   memberOnlyWrite: true;
//   endorsementPolicy: {
//     identities: [
//       { role: { name: "member"; mspId: "Org1MSP" } },
//       { role: { name: "member"; mspId: "Org2MSP" } },
//     ];
//     rule: "OR('Org1MSP.member', 'Org2MSP.member')";
//   };
// };

export type FabricPolicyIdentity = {
  role: {
    name: string;
    mspId: string;
  };
};

export type FabricCollection = {
  name: string;
  policy: string;
  requiredPeerCount: number;
  maxPeerCount: number;
  blockToLive: number;
  memberOnlyRead: boolean;
  memberOnlyWrite: boolean;
  endorsementPolicy: {
    identities: FabricPolicyIdentity[];
    rule: string;
  };
};

export type PrivateCollection = {
  name: string;
  policy: string;
  requiredPeerCount: number;
  maxPeerCount: number;
  blockToLive: number;
  memberOnlyRead: boolean;
  memberOnlyWrite: boolean;
  endorsementPolicy?: {
    signaturePolicy: string;
  };
};

export function collectionFor(
  collectionName: string,
  policy: string,
  requiredPeerCount: number,
  maxPeerCount: number,
  blockToLive: number,
  memberOnlyRead: boolean,
  memberOnlyWrite: boolean
): PrivateCollection {
  return {
    name: collectionName,
    policy: policy,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite,
  };
}

export function privateCollectionFor(
  mspId: string,
  collectionName: string = `${mspId}Private`,
  requiredPeerCount: number = 0,
  maxPeerCount: number = 0,
  blockToLive: number = 0,
  memberOnlyRead: boolean = true,
  memberOnlyWrite: boolean = true
): PrivateCollection {
  return collectionFor(
    collectionName,
    `OR('${mspId}MSP.member')`,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite
  );
}

export function sharedCollectionFor(
  mspIds: string[],
  collectionName: string,
  requiredPeerCount: number = 1,
  maxPeerCount: number = 2,
  blockToLive: number = 0,
  memberOnlyRead: boolean = true,
  memberOnlyWrite: boolean = true
): PrivateCollection {
  const c = collectionFor(
    collectionName,
    `OR(${mspIds.map((m) => `'${m}MSP.member'`).join(",")})`,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite
  );
  c.endorsementPolicy = {
    signaturePolicy: `AND(${mspIds.map((m) => `'${m}MSP.peer'`).join(",")})`,
  };
  return c;
}

export function extractCollections<M extends Model>(
  m: Constructor<M>,
  mspIds: string[],
  overrides?: {
    privateCols: Partial<PrivateCollection>;
    sharedCols: Partial<PrivateCollection>;
  }
) {
  const { privateCols, sharedCols } = Model.collectionsFor(m);
  if (
    (privateCols.length && privateCols.find((p) => sharedCols.includes(p))) ||
    (sharedCols.length && sharedCols.find((s) => privateCols.includes(s)))
  ) {
    throw new InternalError(
      `Private and shared collections cannot share the same name`
    );
  }

  const privateDefaults = Object.assign(
    {},
    {
      requiredPeerCount: 0,
      maxPeerCount: 0,
      blockToLive: 0,
      memberOnlyRead: true,
      memberOnlyWrite: true,
    },
    overrides?.privateCols || {}
  );
  const sharedDefaults = Object.assign(
    {},
    {
      requiredPeerCount: 1,
      maxPeerCount: 2,
      blockToLive: 0,
      memberOnlyRead: true,
      memberOnlyWrite: true,
    },
    overrides?.privateCols || {}
  );

  const privates = mspIds
    .map((mspId) =>
      privateCols.map((p) => {
        const {
          requiredPeerCount,
          maxPeerCount,
          blockToLive,
          memberOnlyRead,
          memberOnlyWrite,
        } = privateDefaults;
        return privateCollectionFor(
          mspId,
          p,
          requiredPeerCount,
          maxPeerCount,
          blockToLive,
          memberOnlyRead,
          memberOnlyWrite
        );
      })
    )
    .flat();

  const shared = sharedCols.map((p) => {
    const {
      requiredPeerCount,
      maxPeerCount,
      blockToLive,
      memberOnlyRead,
      memberOnlyWrite,
    } = sharedDefaults;
    return sharedCollectionFor(
      mspIds,
      p,
      requiredPeerCount,
      maxPeerCount,
      blockToLive,
      memberOnlyRead,
      memberOnlyWrite
    );
  });

  return {
    privates,
    shared,
  };
}

export function writeCollections(
  cols: PrivateCollection[],
  p: string = process.cwd(),
  fileName = "collections_config"
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  function ensureDirectoryExistence(filePath: string) {
    const dirname: string = path.dirname(filePath) as string;
    if (fs.existsSync(dirname)) {
      return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
  }

  const file = path.resolve(path.join(p, `./META-INF/${fileName}.json`));
  ensureDirectoryExistence(file);
  fs.writeFileSync(file, JSON.stringify(cols, undefined, 2));
}
