import { Info, Context as Ctx } from "fabric-contract-api";
import { Leaflet } from "./models/OtherLeaflet";
import { SerializedCrudContract } from "../contracts/index";

@Info({
  title: "LeafletContract",
  description: "Contract managing the Leaflets",
})
export class OtherLeafletContract extends SerializedCrudContract<Leaflet> {
  constructor() {
    super(OtherLeafletContract.name, Leaflet);
  }

  override create(ctx: Ctx, model: string): Promise<string> {
    return super.create(ctx, model);
  }

  override read(ctx: Ctx, key: string): Promise<string> {
    return super.read(ctx, key);
  }

  override update(ctx: Ctx, model: string): Promise<string> {
    return super.update(ctx, model);
  }

  override delete(ctx: Ctx, key: string): Promise<string> {
    return super.delete(ctx, key);
  }

  override deleteAll(ctx: Ctx, keys: string): Promise<string> {
    return super.deleteAll(ctx, keys);
  }

  override readAll(ctx: Ctx, keys: string): Promise<string> {
    return super.readAll(ctx, keys);
  }

  override updateAll(ctx: Ctx, models: string): Promise<string> {
    return super.updateAll(ctx, models);
  }

  override statement(ctx: Ctx, method: string, args: string): Promise<string> {
    return super.statement(ctx, method, args);
  }

  override listBy(ctx: Ctx, key: string, order: string): Promise<string> {
    return super.listBy(ctx, key, order);
  }

  override paginateBy(
    ctx: Ctx,
    key: string,
    order: string,
    ref: string
  ): Promise<string> {
    return super.paginateBy(ctx, key, order, ref);
  }

  override findOneBy(ctx: Ctx, key: string, value: string): Promise<string> {
    return super.findOneBy(ctx, key, value);
  }

  override createAll(context: Ctx, models: string): Promise<string> {
    return super.createAll(context, models);
  }
}
