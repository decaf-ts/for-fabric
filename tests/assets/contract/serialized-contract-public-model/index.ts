/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from "fabric-contract-api";
import { TestPublicModelContract } from "./TestPublicModelContract";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
console.log(FabricCrudContract.name);

export const contracts: (typeof Contract)[] = [TestPublicModelContract];
