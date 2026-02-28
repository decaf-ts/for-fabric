import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";

import {
  Adapter,
  Dispatch,
  EventIds,
  MaybeContextualArg,
} from "@decaf-ts/core";
import { type FabricContractAdapter } from "./ContractAdapter";
import { FabricContractContext } from "./ContractContext";

export class FabricContractDispatch extends Dispatch<FabricContractAdapter> {
  constructor() {
    super();
  }

  protected override async initialize(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<void> {
    if (!this.adapter) {
      return;
    }
    const log = this.log.for(this.initialize);
    log.verbose(`Initializing ${this.adapter}'s event Dispatch`);
    const adapter = this.adapter as Adapter<any, any, any, any>;
    (
      [
        OperationKeys.CREATE,
        OperationKeys.UPDATE,
        OperationKeys.DELETE,
        BulkCrudOperationKeys.CREATE_ALL,
        BulkCrudOperationKeys.UPDATE_ALL,
        BulkCrudOperationKeys.DELETE_ALL,
      ] as (keyof Adapter<any, any, any, any>)[]
    ).forEach((toWrap) => {
      if (!adapter[toWrap])
        throw new InternalError(
          `Method ${toWrap as string} not found in ${adapter.alias} adapter to bind Observables Dispatch`
        );

      let descriptor = Object.getOwnPropertyDescriptor(adapter, toWrap);
      let proto: any = adapter;
      while (!descriptor && proto !== Object.prototype) {
        proto = Object.getPrototypeOf(proto);
        descriptor = Object.getOwnPropertyDescriptor(proto, toWrap);
      }

      if (!descriptor || !descriptor.writable) {
        this.log.error(
          `Could not find method ${toWrap as string} to bind Observables Dispatch`
        );
        return;
      }
      function bulkToSingle(method: string) {
        switch (method) {
          case BulkCrudOperationKeys.CREATE_ALL:
            return OperationKeys.CREATE;
          case BulkCrudOperationKeys.UPDATE_ALL:
            return OperationKeys.UPDATE;
          case BulkCrudOperationKeys.DELETE_ALL:
            return OperationKeys.DELETE;
          default:
            return method;
        }
      }

      (adapter as any)[toWrap] = new Proxy(adapter[toWrap], {
        apply: async (target: any, thisArg: any, argArray: any[]) => {
          const { log, ctxArgs, ctx } = thisArg["logCtx"](
            argArray.slice(3 - (4 - argArray.length), argArray.length),
            target
          );
          const [tableName, ids, payload] = argArray;
          const result = await target.apply(thisArg, [
            tableName,
            ids,
            payload,
            ...ctxArgs,
          ]);

          const resultArgs: [string, string, EventIds] = [
            tableName,
            bulkToSingle(toWrap as string),
            ids,
          ];

          if (ctx.get("observeFullResult")) {
            resultArgs.push(
              Array.isArray(result)
                ? result.map((r) => tableName(r))
                : tableName(result)
            );
          }
          this.updateObservers(...resultArgs, ...ctxArgs).catch((e: unknown) =>
            log.error(
              `Failed to dispatch observer refresh for ${toWrap as string} on ${tableName.name || tableName} for ${ids}: ${e}`
            )
          );
          return result;
        },
      });
    });
  }
}
