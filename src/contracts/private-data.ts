// import { InternalError, SerializationError } from "@decaf-ts/db-decorators";
// import { Model } from "@decaf-ts/decorator-validation";
// import { FabricModelKeys } from "../shared/constants";
// import { Constructor, Metadata } from "@decaf-ts/decoration";
//
// export const MISSING_PRIVATE_DATA_REGEX =
//   /private\s+data\s+matching\s+public\s+hash\s+version\s+is\s+not\s+available/i;
//
// export const MISSING_PRIVATE_DATA_ERROR_MESSAGE =
//   "private data matching public hash version is not available ...";
//
// export function processModel<M extends Model>(adapter: any, model: M) {
//   const transient = Model.segregate(model);
//   const privateData = modelToPrivate(model);
//
//   const transformModel = (model: any) => {
//     return Object.entries(model).reduce(
//       (accum: Record<string, any>, [key, val]) => {
//         if (typeof val === "undefined") return accum;
//         const mappedProp = Model.columnName(
//           model.constructor as Constructor,
//           key as any
//         );
//         if (adapter.isReserved(mappedProp))
//           throw new InternalError(`Property name ${mappedProp} is reserved`);
//         accum[mappedProp] = val;
//         return accum;
//       },
//       {}
//     );
//   };
//
//   if (privateData.private) {
//     const collections = Object.keys(privateData.private);
//
//     for (const collection of collections) {
//       privateData.private![collection] = transformModel(
//         privateData.private![collection]
//       );
//     }
//   }
//
//   return {
//     model: transient.model,
//     transient: transient.transient,
//     privateData: privateData.private,
//     result: transformModel(transient.model),
//   };
// }
//
// export function hasPrivateData<M extends Model>(model: M) {
//   return !!getClassPrivateDataMetadata(model);
// }
//
// export function getClassPrivateDataMetadata<M extends Model>(
//   model: M
// ): Record<string, any> | undefined {
//   const constr = model.constructor as Constructor;
//   const rootMetadata = Metadata.get(constr) || {};
//   if (rootMetadata && rootMetadata[FabricModelKeys.PRIVATE])
//     return rootMetadata[FabricModelKeys.PRIVATE];
//   if (
//     rootMetadata &&
//     rootMetadata[FabricModelKeys.FABRIC + FabricModelKeys.PRIVATE]
//   )
//     return rootMetadata[FabricModelKeys.FABRIC + FabricModelKeys.PRIVATE];
//   const flattened = Object.keys(rootMetadata || {}).reduce(
//     (accum: Record<string, any>, key) => {
//       if (key.includes(FabricModelKeys.PRIVATE)) {
//         const property = key.split(Metadata.splitter).pop();
//         if (property) accum[property] = Metadata.get(constr, key);
//       }
//       return accum;
//     },
//     {} as Record<string, any>
//   );
//   if (Object.keys(flattened).length) return flattened;
//   const classKey = Metadata.key(
//     FabricModelKeys.FABRIC + FabricModelKeys.PRIVATE
//   );
//   const classMetadata =
//     Metadata.get(constr, classKey) ??
//     Metadata.get(constr, FabricModelKeys.PRIVATE);
//   if (classMetadata) return classMetadata;
//   const props = Metadata.properties(constr) || [];
//   const metadata: Record<string, any> = {};
//   for (const prop of props) {
//     const keys = [
//       Metadata.key(FabricModelKeys.PRIVATE, prop),
//       Metadata.key(classKey, prop),
//     ];
//     const propMetadata = keys
//       .map((key) => Metadata.get(constr, key))
//       .find(Boolean);
//     if (propMetadata) metadata[prop] = propMetadata;
//   }
//   return Object.keys(metadata).length ? metadata : undefined;
// }
//
// export function isModelPrivate<M extends Model>(model: M): boolean {
//   const classMetadata = Metadata.get(
//     model.constructor as Constructor,
//     Metadata.key(FabricModelKeys.FABRIC + FabricModelKeys.PRIVATE)
//   );
//   return Boolean(classMetadata?.isPrivate);
// }
//
// export function modelToPrivate<M extends Model>(
//   model: M
// ): { model: M; private?: Record<string, Record<string, any>> } {
//   if (!hasPrivateData(model)) return { model: model };
//
//   const isPrivate = isModelPrivate(model);
//   const modelCollections: Record<string, any> =
//     getClassPrivateDataMetadata(model);
//
//   let result: { model: Record<string, any>; private?: Record<string, any> } = {
//     model: model as Record<string, any>,
//     private: undefined,
//   };
//
//   // TODO: the is private is not workign correctly. If no properties it doesn't create the private part.
//   if (isPrivate) {
//     const privatePart = modelCollections.collections;
//     result = (
//       Metadata.properties(model.constructor as Constructor) || []
//     ).reduce(
//       (
//         accum: { model: Record<string, any>; private?: Record<string, any> },
//         k
//       ) => {
//         const collections = modelCollections.collections;
//         accum.private = accum.private || {};
//
//         for (const collection of collections) {
//           try {
//             accum.private[collection] = accum.private[collection] || {};
//             accum.private[collection][k] = model[k as keyof M];
//           } catch (e: unknown) {
//             throw new SerializationError(
//               `Failed to serialize private property ${k}: ${e}`
//             );
//           }
//         }
//
//         return accum;
//       },
//       { model: {}, private: privatePart } as {
//         model: Record<string, any>;
//         private?: Record<string, any>;
//       }
//     );
//   } else {
//     result = Object.entries(modelCollections).reduce(
//       (
//         accum: { model: Record<string, any>; private?: Record<string, any> },
//         [k, val]
//       ) => {
//         const props = Metadata.properties(model.constructor as Constructor);
//         if (!props?.includes(k)) return accum;
//
//         const collections = (val as Record<string, any>).collections;
//
//         if (collections?.length) {
//           accum.private = accum.private || {};
//
//           for (const collection of collections) {
//             try {
//               accum.private[collection] = accum.private[collection] || {};
//               accum.private[collection][k] = model[k as keyof M];
//             } catch (e: unknown) {
//               throw new SerializationError(
//                 `Failed to serialize private property ${k}: ${e}`
//               );
//             }
//           }
//         } else {
//           accum.model = accum.model || {};
//           accum.model[k] = (model as Record<string, any>)[k];
//         }
//         return accum;
//       },
//       {} as { model: Record<string, any>; private?: Record<string, any> }
//     );
//   }
//
//   result.model = result.model || {};
//
//   result.model = Model.build(result.model, model.constructor.name);
//
//   if (result.private) {
//     const collections = Object.keys(result.private);
//
//     for (const collection of collections) {
//       result.private![collection] = Model.build(
//         result.private![collection],
//         model.constructor.name
//       );
//     }
//   }
//   return result as { model: M; private?: Record<string, Record<string, any>> };
// }
