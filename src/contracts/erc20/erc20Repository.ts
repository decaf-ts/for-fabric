import { FabricClientRepository } from "../../client/FabricClientRepository";
import { ERC20Token, ERC20Wallet } from "./models";
import { Constructor, Serializer } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../client/FabricClientAdapter";
import { ClientSerializer } from "../../shared/ClientSerializer";

export class FabricERC20ClientRepository extends FabricClientRepository<ERC20Wallet> {
  private static serializer = new ClientSerializer();

  protected readonly serializer: Serializer<any> =
    FabricERC20ClientRepository.serializer;

  protected override get adapter(): FabricClientAdapter {
    return super.adapter as FabricClientAdapter;
  }
  constructor(adapter?: FabricClientAdapter, clazz?: Constructor<ERC20Wallet>) {
    super(adapter, clazz);
  }

  async initialize(token: ERC20Token): Promise<void> {
    await this.adapter.submitTransaction("initialize", [
      FabricERC20ClientRepository.serializer.serialize(token),
    ]);
  }
}
