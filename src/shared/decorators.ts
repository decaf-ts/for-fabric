import { AuthorizationError } from "@decaf-ts/core";
import {
  FabricContractContext,
  FabricContractRepository,
  FabricERC20Contract,
} from "../contracts";
import {
  afterDelete,
  afterRead,
  NotFoundError,
  onCreateUpdate,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { apply, metadata } from "@decaf-ts/reflection";
import { Model, propMetadata } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";

export function Owner() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: FabricERC20Contract,
      ...args: any[]
    ) {
      const ctx: FabricContractContext = args[0];
      const acountId = ctx.identity.getID();

      const tokens = await (this as FabricERC20Contract)["tokenRepository"]
        .select(undefined, ctx)
        .execute();

      if (tokens.length == 0) {
        throw new NotFoundError("No tokens avaialble");
      }

      if (tokens.length > 1) {
        throw new NotFoundError(`To many token available : ${tokens.length}`);
      }

      if (tokens[0].owner != acountId) {
        throw new AuthorizationError(
          `User not authorized to run ${propertyKey} on the token`
        );
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

export function getFabricModelKey(key: string) {
  return Model.key(FabricModelKeys.FABRIC + key);
}

// export function privateAfterRead(collection?: string) {
//   return function privateAfterRead<T extends Model>(
//     this: FabricContractRepository<T>,
//     key: string,
//     model: T,
//     ...args: any[]
//   ) {
//     console.log("privateOnCreate called");
//     const ctx = args.pop();
//     console.log(model);
//     console.log(key);
//     console.log(ctx);
//     console.log(collection);
//     console.log(args);
//   };
//   // return function privateAfterRead<T extends AeonState>(this: AsyncRepository<T>, key: string, model: T, ...args: (any | ModelCallback<T>)[]){
//   //     const callback = args.pop();
//   //     if (!callback)
//   //         throw new Error("No callback")

//   //     if (!(this as any).Stub)
//   //         return callback(new Error("Not a valid Repository. Are you providing a IAeonStateRepository?"));

//   //     const logger = Logging.forClass(this.constructor.name)

//   //     const repo: IAeonStateRepository<T> = this as unknown as IAeonStateRepository<T>;
//   //     let id: string | number;
//   //     let mspId: string;
//   //     try {
//   //         mspId = repo.Identity.getMSPID();
//   //         id = findModelID(model)
//   //     } catch (e: any) {
//   //         logger.error(e)
//   //         return callback(e);
//   //     }

//   //     const decoder = new TextDecoder("utf-8");

//   //     const collection = collec || stringFormat(AeonModelKeys.IMPLICIT_COLLECTION, mspId);
//   //     const k = [model.constructor.name, id, key].join(DefaultIndexSeparator);
//   //     logger.debug(`Retrieving private data from ${collection}-${k}`)
//   //     repo.Stub.getPrivateData(
//   //       collection,
//   //       k)
//   //       .then((result) => {
//   //           if (result)
//   //               (model as any)[key] = JSON.parse(decoder.decode(result));
//   //           callback(undefined, model);
//   //       }).catch((e: any) => {
//   //         logger.error(e)
//   //         callback(e);
//   //     });
//   // }
// }

// export function privateAfterDelete<T extends Model>(
//   this: FabricContractRepository<T>,
//   key: string,
//   model: T,
//   ...args: any[]
// ) {
//   console.log("privateAfterDelete called");
//   const ctx = args.pop();
//   console.log(model);
//   console.log(key);
//   console.log(ctx);
//   // console.log(collection);
//   console.log(args);
// }
// // return function privateAfterDelete<T extends AeonState>(this: AsyncRepository<T>, key: string, model: T, ...args: (any | ModelCallback<T>)[]){
// //     const callback = args.pop();
// //     if (!callback)
// //         throw new Error("No callback")
// //     if (!(this as any).Stub)
// //         return callback(new Error("Not a valid Repository. Are you providing a IAeonStateRepository?"));
// //     const logger = Logging.forClass(this.constructor.name)

// //     const repo: IAeonStateRepository<T> = this as unknown as IAeonStateRepository<T>;
// //     let id: string | number;
// //     let mspId: string;
// //     try {
// //         mspId = repo.Identity.getMSPID();
// //         id = findModelID(model)
// //     } catch (e: any) {
// //         return callback(e);
// //     }

// //     const collection = collec || stringFormat(AeonModelKeys.IMPLICIT_COLLECTION, mspId);
// //     const k = [model.constructor.name, id, key].join(DefaultIndexSeparator);
// //     logger.debug(`Deleting private data from ${collection}-${k}`)

// //     repo.Stub.deletePrivateData(
// //       collection,
// //       k)
// //       .then(() => {
// //           callback(undefined, model);
// //       }).catch((e: any) => {
// //         callback(e);
// //     });
// // }

// export async function privateOnCreate<  M extends Model,
//   R extends FabricContractRepository<M>,
// >(
//   this: R,
//   context: FabricContractContext,
//   data: { collection: string},
//   key: keyof M,
//   model: M
// ): Promise<void> {
//     console.log("privateOnCreate called");
//   console.log(context)
//   console.log(data)
//   console.log(key)
//   console.log(model)

//   };
//   // return function privateOnCreate<T extends Model>(this: AsyncRepository<T>, key: string, model: T, ...args: (any | ModelCallback<T>)[]){

//   //     if (!(this as any).Stub)
//   //         return callback(new Error("Not a valid Repository. Are you providing a IAeonStateRepository?"));
//   //     const logger = Logging.forClass(this.constructor.name)

//   //     const repo: IAeonStateRepository<T> = this as unknown as IAeonStateRepository<T>;
//   //     let id: string | number;
//   //     let mspId: string;
//   //     try {
//   //         mspId = repo.Identity.getMSPID();
//   //         id = findModelID(model)
//   //     } catch (e: any) {
//   //         logger.error(e)
//   //         return callback(e);
//   //     }

//   //     const encoder = new TextEncoder();
//   //     const collection = collec || stringFormat(AeonModelKeys.IMPLICIT_COLLECTION, mspId);
//   //     const k = [model.constructor.name, id, key].join(DefaultIndexSeparator);
//   //     logger.debug(`Putting private data to ${collection}-${k}`)
//   //     repo.Stub.putPrivateData(
//   //       collection,
//   //       k,
//   //       encoder.encode(JSON.stringify(model[key])))
//   //       .then(() => {
//   //           callback(undefined, model);
//   //       }).catch((e: any) => {
//   //         logger.error(e)
//   //         callback(e)
//   //     });
//   // }
// }

export function privateData(collect?: string) {
  if (!collect) {
    throw new Error("Collection name is required");
  }

  const collections = {
    collection: collect as string,
  };

  //TODO: Adjust to support multiple collections maybe comma separated colleciton names
  // Get metadata and add new collection to the metadata

  return apply(
    propMetadata(getFabricModelKey(FabricModelKeys.PRIVATE), collections)
  );
}
