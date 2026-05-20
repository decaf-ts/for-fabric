import { Context as Ctx, Info } from "fabric-contract-api";
import { UnsupportedError } from "@decaf-ts/core";
import { OtherLeafletFile } from "./models/OtherLeafletFile";
import { SerializedCrudContract } from "../contracts/index";

@Info({
  title: "LeafletFileContract",
  description: "Contract managing the Leaflet files",
})
export class OtherLeafletFileContract extends SerializedCrudContract<OtherLeafletFile> {
  constructor() {
    super(OtherLeafletFileContract.name, OtherLeafletFile);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override update(context: Ctx, model: string): Promise<string> {
    throw new UnsupportedError(`Leaflet files cannot be updated directly`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override updateAll(_context: Ctx, models: string): Promise<string> {
    throw new UnsupportedError(`Leaflet files cannot be updated directly`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override delete(context: Ctx, key: string): Promise<string> {
    throw new UnsupportedError(`Leaflet files cannot be deleted directly`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override deleteAll(context: Ctx, keys: string): Promise<string> {
    throw new UnsupportedError(`Leaflet files cannot be deleted directly`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override create(ctx: Ctx, model: string): Promise<string> {
    throw new UnsupportedError(`Leaflet files cannot be created directly`);
  }

  override read(ctx: Ctx, key: string): Promise<string> {
    return super.read(ctx, key);
  }

  override readAll(ctx: Ctx, keys: string): Promise<string> {
    return super.readAll(ctx, keys);
  }

  override statement(ctx: Ctx, method: string, args: string): Promise<string> {
    return super.statement(ctx, method, args);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override createAll(context: Ctx, models: string): Promise<string> {
    throw new UnsupportedError(
      `Leaflet files cannot be created directly via SC`
    );
  }
}
