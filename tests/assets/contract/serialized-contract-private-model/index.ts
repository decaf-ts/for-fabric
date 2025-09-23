/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from "fabric-contract-api";
import { TestPrivateModelContract } from "./TestPrivateModelContract";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
console.log(FabricCrudContract.name);

export const contracts: (typeof Contract)[] = [TestPrivateModelContract];
