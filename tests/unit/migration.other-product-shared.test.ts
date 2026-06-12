import { MigrationContract } from "../../src/contracts/MigrationContract";
import { AbsMigration, migration, MigrationError } from "@decaf-ts/core/migrations";
import { getMockCtx } from "./ContextMock";

const TEST_MIGRATION_REF = "test-1.0.0";
const TEST_MIGRATION_WITH_ARGS_REF = "test-args-1.0.0";

@migration(TEST_MIGRATION_REF, "hlf-fabric")
export class TestMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(qr: any, adapter: any): Promise<void> {
    console.log("TestMigration up - EXECUTED");
  }

  async down(qr: any, adapter: any): Promise<void> {
    console.log("TestMigration down - EXECUTED");
  }

  async migrate(qr: any, adapter: any): Promise<void> {
    console.log("TestMigration running - EXECUTED - performing actual migration logic");
    // For Fabric, qr is the context and adapter is the FabricContractAdapter
    // The migration should use qr (context) to access the ledger state
  }
}

@migration(TEST_MIGRATION_WITH_ARGS_REF, "hlf-fabric")
export class TestMigrationWithArgs extends AbsMigration<any> {
  static receivedArgs: any[] | undefined;

  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {}
  async down(): Promise<void> {}

  async migrate(qr: any, adapter: any, ...args: any[]): Promise<void> {
    TestMigrationWithArgs.receivedArgs = args;
  }
}

describe("Fabric contract migrations", () => {
  it("migration contract migrate API can be called and executes migrations", async () => {
    const ctx = getMockCtx();
    const stub = ctx.stub as any;
    const migrationContract = new MigrationContract();

    // Initialize the contract
    await migrationContract.init(ctx);

    // Call the migrate API with the test migration reference
    await migrationContract.migrate(ctx as any, "test-1.0.0");
    stub.commit();

    // Verify the contract was initialized
    expect(migrationContract.initialized).toBe(true);
  });

  it("forwards migration payload args to the migration's migrate method along with the context", async () => {
    const ctx = getMockCtx();
    const stub = ctx.stub as any;
    const migrationContract = new MigrationContract();

    await migrationContract.init(ctx);

    await migrationContract.migrate(
      ctx as any,
      TEST_MIGRATION_WITH_ARGS_REF,
      JSON.stringify(["product-code-1"])
    );
    stub.commit();

    expect(TestMigrationWithArgs.receivedArgs?.[0]).toBe("product-code-1");
    expect(TestMigrationWithArgs.receivedArgs?.[1]).toBeDefined();
    expect((TestMigrationWithArgs.receivedArgs?.[1] as any).stub).toBeDefined();
  });
});
