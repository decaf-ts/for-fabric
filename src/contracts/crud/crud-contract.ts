import { Context, Contract } from "fabric-contract-api";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContext } from "../FabricContext";

export class CrudContract<M extends Model> extends Contract {
  private static textDecoder = new TextDecoder("utf8");

  createContext(): Context {
    const fabricContextOriginal = super.createContext();
    return FabricContext.fromContext(fabricContextOriginal);
  }
}
