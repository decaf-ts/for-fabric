import { FabricContractAdapter } from "../ContractAdapter";

import { Contract, Context as Ctx } from "fabric-contract-api";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";

export class CrudContract<M extends Model> extends Contract {
  protected adapter: FabricContractAdapter;

  constructor(
    name: string,
    private clazz: Constructor<M>
  ) {
    super(name);
    this.adapter = new FabricContractAdapter(
      undefined,
      `fabric-${name}-contract`
    );
  }

  protected repository(ctx: Ctx) {
    return Repository.forModel(this.clazz, this.adapter.alias, ctx);
  }

  async create(ctx: Ctx, model: M, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.create(model, ...args);
  }

  async createAll(ctx: Ctx, models: M[], ...args: any[]): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.createAll(models, ...args);
  }

  async delete(ctx: Ctx, key: string | number, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.delete(key, ...args);
  }

  async deleteAll(
    keys: string[] | number[],
    ctx: Ctx,
    ...args: any[]
  ): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.deleteAll(keys, ...args);
  }

  async read(ctx: Ctx, key: string | number, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.read(key, ...args);
  }

  async readAll(
    ctx: Ctx,
    keys: string[] | number[],
    ...args: any[]
  ): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.readAll(keys, ...args);
  }

  async update(ctx: Ctx, model: M, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.update(model, ctx, ...args);
  }

  async updateAll(ctx: Ctx, models: M[], ...args: any[]): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.updateAll(models, ...args);
  }
}
