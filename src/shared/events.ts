import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";

export function generateFabricEventName(
  table: string,
  event: OperationKeys | BulkCrudOperationKeys | string,
  owner?: string
) {
  const params = [table, event];
  if (owner) params.push(owner);
  return params.join("_");
}

export function parseEventName(name: string) {
  const parts = name.split("_");
  if (parts.length < 2 || parts.length > 3)
    throw new InternalError(
      "Invalid event name: " + name + " (expected table_event[_owner])"
    );
  return {
    table: parts[0],
    event: parts[1],
    owner: parts[2],
  } as {
    table: string;
    event: OperationKeys | BulkCrudOperationKeys | string;
    owner?: string;
  };
}
