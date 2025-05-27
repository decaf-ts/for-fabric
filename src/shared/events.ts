import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";

export function generateFabricEventName(
  table: string,
  event: OperationKeys | BulkCrudOperationKeys | string,
  owner?: string
) {
  const params = [table, event];
  if (owner) params.push(owner);
  return params.join("_");
}
