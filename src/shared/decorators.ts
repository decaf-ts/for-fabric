import { AuthorizationError } from "@decaf-ts/core";
import { FabricContractContext, FabricERC20Contract } from "../contracts";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Model, ModelKeys, propMetadata } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";

/**
 * @description Method decorator enforcing token ownership in Fabric ERC20 contracts
 * @summary Wraps a contract method to ensure the invoking identity matches the owner of the single available token. Throws NotFoundError if no or multiple tokens exist, and AuthorizationError if the caller is not the owner. Passes through to the original method upon successful validation.
 * @param {any} target - The prototype of the class where the method is declared
 * @param {string} propertyKey - The name of the decorated method
 * @param {PropertyDescriptor} descriptor - The method descriptor being decorated
 * @return {MethodDecorator} A method decorator that enforces ownership at runtime
 * @function Owner
 * @category Decorators
 * @mermaid
 * sequenceDiagram
 *   participant D as Decorator
 *   participant C as FabricERC20Contract
 *   participant X as FabricContractContext
 *   participant R as tokenRepository
 *   D->>C: wrap method(propertyKey)
 *   C->>X: read identity.getID()
 *   C->>R: select().execute()
 *   R-->>C: tokens[]
 *   alt 0 tokens
 *     C-->>D: throw NotFoundError
 *   else >1 tokens
 *     C-->>D: throw NotFoundError
 *   else 1 token
 *     alt caller != owner
 *       C-->>D: throw AuthorizationError
 *     else authorized
 *       C->>C: call original method
 *     end
 *   end
 */
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

/**
 * @description Builds a Fabric-specific metadata key for model properties
 * @summary Prefixes the provided key with the Fabric model namespace, allowing decorators to store and retrieve metadata consistently across Fabric-integrated models.
 * @param {string} key - The metadata key suffix to be namespaced
 * @return {string} The computed namespaced metadata key
 * @function getFabricModelKey
 * @category Decorators
 */
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

/**
 * @description Decorator factory to mark models or attributes as private data in Fabric
 * @summary Registers metadata indicating that a model or specific attributes belong to a given private data collection. When applied at class-level, marks the whole model as private and merges collections; when applied at property-level, attaches the collection list to the property.
 * @param {string} [collection] - The private data collection name to associate with the model or property
 * @return {function(any, string): void} A decorator function to apply at class or property level
 * @function privateData
 * @category Decorators
 * @mermaid
 * sequenceDiagram
 *   participant F as Factory(privateData)
 *   participant D as Decorator
 *   participant M as Model/Prototype
 *   F->>F: validate collection
 *   F-->>D: return decorator
 *   D->>M: read existing metadata
 *   D->>M: write merged collections metadata
 *   alt attribute-level
 *     D->>M: set property-level metadata
 *   end
 */
export function privateData(collection?: string) {
  if (!collection) {
    throw new Error("Collection name is required");
  }

  const key: string = getFabricModelKey(FabricModelKeys.PRIVATE);

  return function privateData(model: any, attribute?: string) {
    const propertyKey = attribute || undefined;

    const meta = Reflect.getMetadata(
      key,
      model[ModelKeys.ANCHOR] || model,
      propertyKey as string
    );
    const data = meta?.collections || [];

    propMetadata(getFabricModelKey(FabricModelKeys.PRIVATE), {
      ...(!attribute && {
        collections: data ? [...new Set([...data, collection])] : [collection],
      }),
      isPrivate: !attribute,
    })(attribute ? model.constructor : model[ModelKeys.ANCHOR] || model);

    if (attribute)
      propMetadata(getFabricModelKey(FabricModelKeys.PRIVATE), {
        collections: data ? [...new Set([...data, collection])] : [collection],
      })(model, attribute);
  };
}
