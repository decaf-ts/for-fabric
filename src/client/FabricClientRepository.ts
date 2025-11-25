import {
  Adapter,
  ContextOf,
  MaybeContextualArg,
  Repository,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import {
  Context,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { FabricFlags } from "../shared";
import { Constructor } from "@decaf-ts/decoration";
import { FabricContractContext } from "../contracts/index";

/**
 * @description Repository implementation for Fabric client operations
 * @summary Extends the generic Repository to prepare context and arguments for CRUD operations executed via a Fabric client Adapter, wiring RepositoryFlags and Fabric-specific overrides.
 * @template M extends Model - The model type handled by this repository
 * @param {Adapter<any, MangoQuery, FabricFlags, Context<FabricFlags>>} [adapter] - Optional adapter instance used to execute operations
 * @param {Constructor<M>} [clazz] - Optional model constructor used by the repository
 * @return {void}
 * @class FabricClientRepository
 * @example
 * import { Repository } from "@decaf-ts/core";
 * import { FabricClientRepository } from "@decaf-ts/for-fabric";
 *
 * class User extends Model { id!: string; name!: string; }
 * const repo = new FabricClientRepository<User>();
 * const created = await repo.create(new User({ id: "1", name: "Alice" }));
 * const loaded = await repo.read("1");
 *
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Repo as FabricClientRepository
 *   participant Adapter
 *   App->>Repo: create(model)
 *   Repo->>Repo: createPrefix(model, ...args)
 *   Repo->>Adapter: create(table, id, model, flags)
 *   Adapter-->>Repo: result
 *   Repo-->>App: model
 */
export class FabricClientRepository<M extends Model> extends Repository<
  M,
  Adapter<any, any, MangoQuery, Context<FabricFlags>>
> {
  override _overrides = {
    ignoreValidation: true,
    ignoreHandlers: true,
  };

  constructor(
    adapter: Adapter<any, any, MangoQuery, Context<FabricFlags>>,
    clazz?: Constructor<M>
  ) {
    super(adapter, clazz);
  }
}
