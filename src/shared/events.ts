import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";

/**
 * @description Generates a Fabric event name from components
 * @summary Creates a standardized event name by joining table, event, and optional owner with underscores
 * @param {string} table - The table/collection name
 * @param {OperationKeys | BulkCrudOperationKeys | string} event - The event type
 * @param {string} [owner] - Optional owner identifier
 * @return {string} The generated event name in format "table_event" or "table_event_owner"
 * @function generateFabricEventName
 * @memberOf module:fabric.shared
 */
export function generateFabricEventName(
  table: string,
  event: OperationKeys | BulkCrudOperationKeys | string,
  owner?: string
) {
  const params = [table, event];
  if (owner) params.push(owner);
  return params.join("_");
}

/**
 * @description Parses a Fabric event name into its components
 * @summary Splits an event name by underscores and extracts table, event, and optional owner
 * @param {string} name - The event name to parse
 * @return The parsed components
 * @throws {InternalError} If the event name format is invalid
 * @function parseEventName
 * @memberOf module:fabric.shared
 */
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
