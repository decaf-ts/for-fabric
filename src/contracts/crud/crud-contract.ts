import { FabricContractAdapter } from "../ContractAdapter";

import { Contract, Context as Ctx } from "fabric-contract-api";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { FabricContractRepository } from "../FabricContractRepository";

export abstract class FabricCrudContract<M extends Model> extends Contract {
  protected static adapter: FabricContractAdapter;

  protected constructor(
    name: string,
    private clazz: Constructor<M>
  ) {
    super(name);
    FabricCrudContract.adapter =
      FabricCrudContract.adapter || new FabricContractAdapter(undefined);
  }

  protected repository(ctx: Ctx): FabricContractRepository<M> {
    return Repository.forModel(
      this.clazz,
      FabricCrudContract.adapter.alias,
      ctx
    );
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

  async raw(
    ctx: Ctx,
    rawInput: any,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any> {
    const repo = this.repository(ctx);
    return repo.raw(rawInput, docsOnly, ...args);
  }
}
