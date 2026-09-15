import { Context } from "@decaf-ts/core";
import { FabricContractFlags } from "./types";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";

/**
 * @description Context class for Fabric chaincode operations
 * @summary Provides access to Fabric-specific context elements like stub, identity, and logger to be used by repositories and adapters during contract execution.
 * @template F - Flags specific to Fabric contract operations
 * @param {object} [args] - Optional initialization arguments passed to the base Context
 * @return {void}
 * @class FabricContractContext
 * @example
 * ```typescript
 * // In a Fabric chaincode contract method
 * const context = new FabricContractContext();
 * // Optionally set values via the base Context API
 * context.set('stub', ctx.stub);
 * context.set('clientIdentity', ctx.clientIdentity);
 * context.set('logger', contractLogger);
 *
 * // Access context properties
 * const timestamp = context.timestamp;
 * const creator = context.identity.getID();
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Contract
 *   participant Context
 *   participant Ledger
 *   Contract->>Context: new FabricContractContext()
 *   Contract->>Context: set('stub'|'clientIdentity'|'logger', ...)
 *   Context-->>Contract: timestamp, identity, logger
 *   Contract->>Ledger: Interact via stub
 */
export class FabricContractContext extends Context<FabricContractFlags> {
  /**
   * @description Creates a new FabricContractContext instance
   * @summary Initializes the context with Fabric-specific flags
   */
  constructor(ctx?: FabricContractContext) {
    super(ctx);
  }

  /**
   * @description Gets the chaincode stub
   * @summary Returns the ChaincodeStub instance for interacting with the ledger
   * @return {ChaincodeStub} The chaincode stub
   */
  get stub(): ChaincodeStub {
    return this.get("stub");
  }

  /**
   * @description Gets the transaction timestamp
   * @summary Overrides the base timestamp getter to use the stub's timestamp
   * @return {Date} The transaction timestamp
   */
  override get timestamp(): Date {
    return this.stub.getDateTimestamp();
  }

  /**
   * @description Gets the client identity
   * @summary Returns the ClientIdentity instance for the transaction submitter
   * @return {ClientIdentity} The client identity
   */
  get identity(): ClientIdentity {
    return this.get("identity");
  }
  //
  // private _segregateWrite: Record<string, SegregatedWriteEntry[]> = {};
  // private _segregateRead: string[] = [];
  // private _fullySegregated: boolean = false;
  //
  // private _sequenceSegregation: Map<
  //   string,
  //   { fullySegregated: boolean; collections: string[] }
  // > = new Map();

  /**
   * @description Stores segregation metadata per sequence name
   * @summary Needed because the Sequence creates its own context (via logCtx),
   * losing flags set by extractSegregatedCollections on the handler context.
   * The adapter persists across operations, making it a reliable store.
   */
  setSequenceSegregation(
    seqName: string,
    fullySegregated: boolean,
    collections: string[]
  ): void {
    let map = this.getFromChildren("sequenceSegregation");
    map = map instanceof Map ? map : new Map();
    const existing = map.get(seqName);
    const mergedCollections = existing
      ? [...new Set([...(existing.collections || []), ...(collections || [])])]
      : collections;
    map.set(seqName, {
      fullySegregated: fullySegregated || !!existing?.fullySegregated,
      collections: mergedCollections,
    });
    this.put("sequenceSegregation", map);
  }

  getSequenceSegregation(
    seqName: string
  ): { fullySegregated: boolean; collections: string[] } | undefined {
    return this.getFromChildren("sequenceSegregation")?.get(seqName);
  }

  markFullySegregated(): void {
    this.put("fullySegregated", true);
  }

  get isFullySegregated(): boolean {
    return !!this.getFromChildren("fullySegregated");
  }

  writeTo(col: string, entry: string[], table?: string) {
    // A transaction can write several models to the same collection. Keep each
    // model's field plan under a separate key so child-context merging cannot
    // substitute (for example) Audit's fields for Product's fields.
    const key = table ? `segregateWrite:${table}` as const : "segregateWrite";
    const existing = this.getFromChildren(key) || {};
    this.put(key, {
      ...existing,
      [col]: [...new Set([...(existing[col] || []), ...entry])],
    });
    // Preserve the collection-only API used by sequence routing and callers
    // which register unscoped writes. Preparation uses the scoped plan only.
    if (table) this.writeTo(col, entry);
  }

  getSegregatedWrites(table?: string) {
    return this.getFromChildren(
      table ? `segregateWrite:${table}` as const : "segregateWrite"
    );
  }

  put(key: string, value: any) {
    this.accumulate({ [key]: value });
  }

  readFrom(cols: string | string[]) {
    cols = Array.isArray(cols) ? cols : [cols];
    const segregateRead = [
      ...new Set([...(this.getOrUndefined("segregateRead") || []), ...cols]),
    ];
    this.put("segregateRead", segregateRead);

    const readStack = this.getOrUndefined("segregateReadStack") || [];
    this.put("segregateReadStack", [...readStack, cols]);
  }

  consumeReadCollections(): string[] {
    const readStack = this.getOrUndefined("segregateReadStack") || [];
    if (readStack.length) {
      const [current, ...rest] = readStack;
      this.put("segregateReadStack", rest);
      return current;
    }
    return this.getReadCollections();
  }

  /**
   * @description Gets the collections registered for writing
   * @summary Returns collection names from segregateWrite, used by sequences to know where to replicate.
   * @return {string[]} Array of collection names, empty if none registered
   */
  getWriteCollections(): string[] {
    return Object.keys(this.getOrUndefined("segregateWrite") || {});
  }

  /**
   * @description Gets the collections registered for reading
   * @summary Returns collection names from segregateRead.
   * @return {string[]} Array of collection names, empty if none registered
   */
  getReadCollections(): string[] {
    const cols = this.getOrUndefined("segregateRead") || [];
    return Array.isArray(cols) ? cols : [cols];
  }

  override toString() {
    return `fabric ctx${this.stub ? " with stub" : "without stub"}`;
  }
}
