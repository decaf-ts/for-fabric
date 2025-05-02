import { Context as FCtx } from "fabric-contract-api";
import { Context as Ctx } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { LoggerStatic } from "winston";
// type FabricContextType = typeof FCtx;

export class FabricContext<M extends Model> extends Ctx<M> {
  get stub(): ChaincodeStub {
    return this.originalContext.stub;
  }

  get clientIdentity(): ClientIdentity {
    return this.originalContext.clientIdentity;
  }

  get logging() {
    return {
      setLevel: (level: string) => this.originalContext.logging.setLevel(level),
      getLogger: (name?: string): LoggerStatic =>
        this.originalContext.logging.getLogger(name) as unknown as LoggerStatic,
    };
  }

  protected constructor(protected originalContext: FCtx) {
    super();
    Object.setPrototypeOf(FCtx, Object.getPrototypeOf(this));
    return this as unknown as FabricContext<M> & FCtx;
  }

  static fromContext<M extends Model>(fCtx: FCtx): FabricContext<M> {
    return new FabricContext(fCtx);
  }
}
