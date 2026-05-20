import "../contracts/bootstrap";
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
import { OtherProductStrengthContract } from "./OtherProductStrengthContract";
import { OtherMarketContract } from "./OtherMarketContract";
import { OtherProductImageContract } from "./OtherProductImageContract";
import { OtherAuditContract } from "./OtherAuditContract";
import { MigrationContract } from "../contracts/MigrationContract";
import { OtherProductContract } from "./OtherProductContract";
import { OtherBatchContract } from "./OtherBatchContract";
import { OtherLeafletContract } from "./OtherLeafletContract";
import { OtherLeafletFileContract } from "./OtherLeafletFileContract";

export const contracts: (typeof Contract)[] = [
  // ProductContract,
  // ProductStrengthContract,
  OtherProductStrengthContract,
  OtherProductContract,
  OtherBatchContract,
  OtherLeafletContract,
  OtherLeafletFileContract,
  // MarketContract,
  OtherMarketContract,
  OtherProductImageContract,
  // BatchContract,
  // UserContract,
  OtherAuditContract,
  // AddressContract,
  OtherProductSharedContract,
  // SegregatedPrivateDocumentContract,
  // SegregatedSharedDocumentContract,
  // MigrationContract,
];
