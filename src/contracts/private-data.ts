import { InternalError, modelToTransient } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { modelToPrivate } from "../shared/model/utils";
import { Repository } from "@decaf-ts/core";

export function processModel<M extends Model>(adapter: any, model: M) {
  const transient = modelToTransient(model);
  const privateData = modelToPrivate(model);

  const transformModel = (model: any) => {
    return Object.entries(model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (typeof val === "undefined") return accum;
        const mappedProp = Repository.column(model, key);
        if (adapter.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
  };

  if (privateData.private) {
    const collections = Object.keys(privateData.private);

    for (const collection of collections) {
      privateData.private![collection] = transformModel(
        privateData.private![collection]
      );
    }
  }

  return {
    model: transient.model,
    transient: transient.transient,
    privateData: privateData.private,
    result: transformModel(transient.model),
  };
}
