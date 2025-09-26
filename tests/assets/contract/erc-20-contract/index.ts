/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from "fabric-contract-api";
import { TestERC20Contract } from "./TestERC20Contract";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
console.log(FabricCrudContract.name);

export const contracts: (typeof Contract)[] = [TestERC20Contract];
