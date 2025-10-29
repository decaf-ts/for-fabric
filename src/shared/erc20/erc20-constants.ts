/**
 * Enum representing the events emitted by an ERC20 contract.
 *
 * @remarks
 * This enum is used to identify the specific events that can be emitted by an ERC20 contract.
 * The events are named according to the EIP-20 standard.
 */
export enum ERC20Events {
  /**
   * Emitted when a `transfer` function is called successfully.
   *
   * @param from - The address of the sender.
   * @param to - The address of the recipient.
   * @param value - The amount of tokens transferred.
   */
  TRANSFER = "Transfer",

  /**
   * Emitted when an `approve` function is called successfully.
   *
   * @param owner - The address of the token owner.
   * @param spender - The address of the approved spender.
   * @param value - The amount of tokens approved for the spender.
   */
  APPROVAL = "Approval",
}
