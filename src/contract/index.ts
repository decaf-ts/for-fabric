import { FabricCrudContract } from "../contracts/crud/crud-contract";
console.log(FabricCrudContract.name);
import { type Contract } from "fabric-contract-api";
import { ProductContract } from "./ProductContract";
import { BatchContract } from "./BatchContract";
import { UserContract } from "./UserContract";
import { AddressContract } from "./AddressContract";
import { OtherProductSharedContract } from "./OtherProductSharedContract";
import { SegregatedPrivateDocumentContract } from "./SegregatedPrivateDocumentContract";
import { SegregatedSharedDocumentContract } from "./SegregatedSharedDocumentContract";
import { ProductStrengthContract } from "./ProductStrengthContract";
import { MarketContract } from "./MarketContract";

export const contracts: (typeof Contract)[] = [
  ProductContract,
  ProductStrengthContract,
  MarketContract,
  BatchContract,
  UserContract,
  AddressContract,
  OtherProductSharedContract,
  SegregatedPrivateDocumentContract,
  SegregatedSharedDocumentContract,
];
