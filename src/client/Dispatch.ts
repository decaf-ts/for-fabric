import {
  Adapter,
  Observable,
  Observer,
  UnsupportedError,
} from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";

export class Dispatch<Y> implements Observable {
  protected adapter?: Adapter<Y, any, any, any>
  protected native?: Y;
  protected models!: ModelConstructor<any>[]

  private constructor() {}

  protected initialize(){

  }

  observe(observer: Observer | Adapter<Y, any, any, any>): void {
    if (!(observer instanceof Adapter))
      throw new UnsupportedError("Only Adapters can be observed by dispatch");
    this.adapter = observer;
    this.native = observer.native;
    this.models = Adapter.models(this.adapter.flavour);
    this.initialize();
  }

  unObserve(observer: Observer): void {
    if (this.adapter !== observer)
      throw new UnsupportedError(
        "Only the adapter that was used to observe can be unobserved"
      );
    this.adapter = undefined;
  }

  async updateObservers(...args: any[]): Promise<void> {
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    this.adapter.refresh(...args);
  }

  static for(adapter: Adapter<any, any, any, any>) {
    const d = new Dispatch();
    d.observe(adapter);
    return d;
  }
}
