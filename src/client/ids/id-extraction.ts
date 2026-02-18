import { Model } from "@decaf-ts/decorator-validation";
import { InternalError, PrimaryKeyType } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { SequenceOptions } from "@decaf-ts/core";
import { composeAttributeValue } from "@decaf-ts/db-decorators";

export function extractIds<M extends Model>(
  clazz: Constructor<M>,
  models: M | M[] | Record<string, any> | Record<string, any>[],
  ids: PrimaryKeyType | PrimaryKeyType[]
) {
  let pk: keyof M;
  let composed: any;
  let pkProps: SequenceOptions;

  function extractId(m: M | Record<string, any>, ids: PrimaryKeyType) {
    pk = pk || Model.pk(clazz);
    pkProps = pkProps || Model.sequenceFor(clazz);
    composed = composed || Model.composed(clazz, pk);

    if (composed) {
      return composeAttributeValue(m as any, composed);
    }

    const id = (m as any)[pk] || ids;
    if (typeof id === "undefined")
      throw new InternalError(`could not rebuild id for ${m.constructor.name}`);
    return id;
  }

  if (Array.isArray(models)) {
    if (!Array.isArray(ids) || ids.length !== models.length)
      throw new InternalError(
        "inconsistent parameters. both must be arrays of equal length"
      );
    return models.map((m, i) => extractId(m, ids[i]));
  }
  return extractId(models, ids as PrimaryKeyType);
}
