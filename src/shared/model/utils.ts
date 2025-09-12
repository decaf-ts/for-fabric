import { Model } from "@decaf-ts/decorator-validation";
import { getFabricModelKey } from "../decorators";
import { FabricModelKeys } from "../constants";
import {
  getAllPropertyDecoratorsRecursive,
  SerializationError,
} from "@decaf-ts/db-decorators";

/**
 * @description Checks whether a model or its class has private data metadata
 * @summary Uses reflection metadata to determine if the given Decaf model includes Fabric private data annotations at instance or constructor level
 * @template M extends Model
 * @param {M} model - The model instance to inspect for private data metadata
 * @return {boolean} True if private data metadata is present; otherwise false
 * @function hasPrivateData
 * @memberOf module:for-fabric.shared
 */
export function hasPrivateData<M extends Model>(model: M) {
  const metadata = getClassPrivateDataMetadata(model);
  if (!metadata) return false;
  return true;
}

/**
 * @description Retrieves the Fabric private data metadata for a model
 * @summary Looks up the metadata key on the instance first and then on the constructor to support both instance and static decorator placement
 * @template M extends Model
 * @param {M} model - The model whose Fabric private data metadata should be retrieved
 * @return {Record<string, any>} The metadata object if present, otherwise undefined-like value
 * @function getClassPrivateDataMetadata
 * @memberOf module:for-fabric.shared
 */
export function getClassPrivateDataMetadata<M extends Model>(
  model: M
): Record<string, any> {
  let metadata = Reflect.getMetadata(
    getFabricModelKey(FabricModelKeys.PRIVATE),
    model
  );

  metadata =
    metadata ||
    Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      model.constructor
    );

  return metadata;
}

/**
 * @description Determines if a model should be fully treated as private
 * @summary Reads the metadata flag isPrivate from the model's Fabric private data metadata and returns its boolean value
 * @template M extends Model
 * @param {M} model - The model instance to check
 * @return {boolean} True when model is marked as private; otherwise false
 * @function isModelPrivate
 * @memberOf module:for-fabric.shared
 */
export function isModelPrivate<M extends Model>(model: M): boolean {
  const metadata = getClassPrivateDataMetadata(model);
  if (!metadata || metadata.isPrivate === undefined) return false;
  return metadata.isPrivate;
}

/**
 * @description Splits a model into public and Fabric private data collections
 * @summary Iterates over property decorators to collect attributes destined for private data collections while keeping public fields, returning a structure containing the rebuilt public model and a map of collection-name to private attributes
 * @template M extends Model
 * @param {M} model - The model instance to transform into public and private parts
 * @return {{ model: M; private?: Record<string, Record<string, any>> }} An object with the rebuilt public model and optional private collection maps
 * @function modelToPrivate
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant Utils as modelToPrivate
 *   participant Meta as Metadata
 *   Caller->>Utils: modelToPrivate(model)
 *   Utils->>Meta: getAllPropertyDecoratorsRecursive(model, PRIVATE)
 *   Utils->>Meta: isModelPrivate(model)
 *   alt model is private or has private props
 *     Utils->>Utils: group properties by collection
 *   else
 *     Utils->>Utils: keep property in public model
 *   end
 *   Utils->>Meta: getClassPrivateDataMetadata(model)
 *   Utils->>Utils: Model.build(public, anchor)
 *   Utils-->>Caller: { model, private }
 * @memberOf module:for-fabric.shared
 */
export function modelToPrivate<M extends Model>(
  model: M
): { model: M; private?: Record<string, Record<string, any>> } {
  if (!hasPrivateData(model)) return { model: model };
  const decs: Record<string, any[]> = getAllPropertyDecoratorsRecursive(
    model,
    undefined,
    getFabricModelKey(FabricModelKeys.PRIVATE)
  ) as Record<string, any[]>;

  const isPrivate = isModelPrivate(model);
  const modelCollections: Record<string, any> =
    getClassPrivateDataMetadata(model);

  const result = Object.entries(decs).reduce(
    (
      accum: { model: Record<string, any>; private?: Record<string, any> },
      [k, val]
    ) => {
      const privateData = val.find((el) => el.key === "");

      if (privateData || isPrivate) {
        const collections = isPrivate
          ? modelCollections.collections
          : privateData.props.collections;
        accum.private = accum.private || {};

        for (const collection of collections) {
          try {
            accum.private[collection] = accum.private[collection] || {};
            accum.private[collection][k] = model[k as keyof M];
          } catch (e: unknown) {
            throw new SerializationError(
              `Failed to serialize private property ${k}: ${e}`
            );
          }
        }
      } else {
        accum.model = accum.model || {};
        accum.model[k] = (model as Record<string, any>)[k];
      }
      return accum;
    },
    {} as { model: Record<string, any>; private?: Record<string, any> }
  );
  result.model = Model.build(result.model, model.constructor.name);
  return result as { model: M; private?: Record<string, Record<string, any>> };
}
