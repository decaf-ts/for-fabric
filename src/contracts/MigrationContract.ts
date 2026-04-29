import {
  Context as Ctx,
  Contract,
  Info,
  Transaction,
} from "fabric-contract-api";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  Adapter,
  MaybeContextualArg,
  MethodOrOperation,
  MigrationError,
  PersistenceKeys,
} from "@decaf-ts/core";
import { Migration } from "@decaf-ts/core/migrations";
import {
  FabricContextualizedArgs,
  FabricContractAdapter,
} from "./ContractAdapter";
import {
  FabricFlavour,
  healthcheck,
  MissingContextError,
} from "../shared/index";
import { InternalError } from "@decaf-ts/db-decorators";
import { FabricContractContext } from "./ContractContext";
import { VERSION, PACKAGE_NAME } from "../version";

@Info({
  title: "MigrationContract",
  description: "Contract for managing data migrations",
})
export class MigrationContract extends Contract {
  private _adapter?: FabricContractAdapter;

  protected initialized: boolean = false;

  constructor() {
    super(MigrationContract.name);
  }

  protected get adapter() {
    if (!this._adapter) {
      try {
        this._adapter = Adapter.get(FabricFlavour) as any;
        if (!this._adapter)
          throw new InternalError(`failed to load adapter. instantiation`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        try {
          this._adapter = new FabricContractAdapter();
        } catch (e: unknown) {
          throw new InternalError(`Failed to instantiate adapter: ${e}`);
        }
      }
    }
    return this._adapter;
  }

  @Transaction()
  async migrate(
    context: Ctx,
    reference: string,
    migrationArgs?: string
  ): Promise<void> {
    let argz: any[] = [];
    if (migrationArgs) {
      argz = JSON.parse(migrationArgs) as any;
      if (!Array.isArray(argz)) {
        throw new InternalError("Migration arguments must be an array");
      }
    }
    const { log, ctx, ctxArgs } = (
      await this.logCtx([...argz, context], PersistenceKeys.MIGRATION, true)
    ).for(this.migrate);

    const migrations = this.getRegisteredMigrations(ctx);

    const migrationMeta = migrations.find((m) => m.reference === reference);

    if (!migrationMeta) {
      throw new InternalError(`Migration ${reference} not found`);
    }

    log.verbose(`migration ${reference} found`);
    const MigrationClass: Constructor<Migration<any, any>> =
      migrationMeta.class;
    const m = new MigrationClass();
    // For Fabric, use the context as the query runner
    const qr: any = ctx;

    try {
      log.verbose(`migration ${reference} up`);
      await m.up(qr, this.adapter, ...ctxArgs);
    } catch (e: unknown) {
      throw new MigrationError(
        `failed to initialize migration ${m.reference}: ${e}`
      );
    }
    try {
      log.verbose(`migration ${reference} migrate`);
      await m.migrate(qr, this.adapter, ...ctxArgs);
    } catch (e: unknown) {
      throw new MigrationError(`failed to migrate ${m.reference}: ${e}`);
    }
    try {
      log.verbose(`migration ${reference} down`);
      await m.down(qr, this.adapter, ...ctxArgs);
    } catch (e: unknown) {
      throw new MigrationError(
        `failed to conclude migration ${m.reference}: ${e}`
      );
    }
  }

  protected getRegisteredMigrations(context: FabricContractContext): Array<{
    class: any;
    reference: string;
    flavour: string;
  }> {
    const migrations: Array<{
      class: any;
      reference: string;
      flavour: string;
    }> = [];

    const migrationList = (Metadata as any).migrations();

    for (const [name, MigrationClass] of migrationList) {
      const meta = Metadata.get(MigrationClass, PersistenceKeys.MIGRATION);

      if (!meta) continue;

      if (meta.flavour !== FabricFlavour) continue;

      migrations.push({
        class: MigrationClass,
        reference: meta.reference,
        flavour: meta.flavour,
      });
    }

    return migrations;
  }

  protected async init(ctx: Ctx | FabricContractContext): Promise<void> {
    const { log } = (
      await this.logCtx([ctx], PersistenceKeys.INITIALIZATION, true)
    ).for(this.init);
    log.info(`Running contract ${this.getName()} initialization...`);
    this.initialized = true;
    log.info(`Contract initialization completed.`);
  }

  async healthcheck(
    ctx: Ctx | FabricContractContext
  ): Promise<string | healthcheck> {
    const { log } = (await this.logCtx([ctx], "healthcheck", true)).for(
      this.healthcheck
    );
    log.info(`Running Healthcheck: ${this.initialized}...`);
    return {
      healthcheck: this.initialized,
      version: VERSION,
      package: PACKAGE_NAME,
    };
  }

  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
  >;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
      >
    | FabricContextualizedArgs<ARGS, METHOD extends string ? true : false> {
    const ctx = args.pop();
    if (!ctx || !ctx.stub) {
      throw new MissingContextError(`No valid context provided...`);
    }
    const contextualized = this.adapter["logCtx"](
      [undefined, ...args] as any,
      operation,
      allowCreate as any,
      ctx
    ) as
      | FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
      | Promise<
          FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
        >;
    function squashArgs(ctx: FabricContextualizedArgs) {
      ctx.ctxArgs.shift(); // removes added model to args
      return ctx as any;
    }

    if (!(contextualized instanceof Promise)) return squashArgs(contextualized);
    return contextualized.then(squashArgs);
  }
}
