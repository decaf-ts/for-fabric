import { OrderDirection } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { CouchDBDesignDoc } from "@decaf-ts/for-couchdb";
import { Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { CollectionResolver } from "../../shared/index";
import { writeDesignDocs } from "../indexes/generation";

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
    `OR('${mspId}.member')`,
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
    `OR(${mspIds.map((m) => `'${m}.member'`).join(",")})`,
    requiredPeerCount,
    maxPeerCount,
    blockToLive,
    memberOnlyRead,
    memberOnlyWrite
  );
  c.endorsementPolicy = {
    signaturePolicy: `AND(${mspIds.map((m) => `'${m}.peer'`).join(",")})`,
  };
  return c;
}

export async function extractCollections<M extends Model>(
  m: Constructor<M>,
  mspIds: string[],
  overrides: {
    privateCols?: Partial<PrivateCollection>;
    sharedCols?: Partial<PrivateCollection>;
  } = {},
  mirror: boolean = false
) {
  let { privateCols, sharedCols } = Model.collectionsFor(m);

  function resolveCollection(arg: string | CollectionResolver): string {
    try {
      if (typeof arg === "string") return arg;
      return arg(m, mspIds[0]) as string;
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    }
  }

  privateCols = privateCols.map(resolveCollection);
  sharedCols = sharedCols.map(resolveCollection);

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
    overrides?.sharedCols || {}
  );

  const mirrorMeta = mirror ? Model.mirroredAt(m) : undefined;

  const privates = mspIds
    .map((mspId) =>
      (privateCols as string[])
        .filter((p) => {
          if (!mirrorMeta) return true;
          const mirroCol =
            typeof mirrorMeta.resolver === "string"
              ? mirrorMeta.resolver
              : mirrorMeta.resolver(m, mspId);
          return (
            mirroCol === p &&
            (mirrorMeta.condition ? mirrorMeta.condition(mspId) : true)
          );
        })
        .map((p) => {
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

  const shared = (sharedCols as string[]).map((p) => {
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

export function writeCollectionDesignDocs(
  docs: CouchDBDesignDoc[],
  p: string = process.cwd(),
  collection?: string
) {
  if (!docs?.length) return;
  writeDesignDocs(docs, p, collection);
}
