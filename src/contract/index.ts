import { FabricCrudContract } from "../contracts/crud/crud-contract";
console.log(FabricCrudContract.name);
import { type Contract } from "fabric-contract-api";
import { ProductContract } from "./ProductContract";
import { UserContract } from "./UserContract";
import { AddressContract } from "./AddressContract";

export const contracts: (typeof Contract)[] = [
  ProductContract,
  UserContract,
  AddressContract,
];
