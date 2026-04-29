import { AbsMigration, migration } from "@decaf-ts/core/migrations";

const TEST_MIGRATION_REF = "test-1.0.0";

console.log("Loading test migration...");

@migration(TEST_MIGRATION_REF, "hlf-fabric")
export class TestMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    console.log("TestMigration up");
  }

  async down(): Promise<void> {
    console.log("TestMigration down");
  }

  async migrate(qr: any): Promise<void> {
    console.log("TestMigration running - performing actual migration logic");
  }
}

console.log("TestMigration decorator applied");
console.log("TestMigration class:", TestMigration);
