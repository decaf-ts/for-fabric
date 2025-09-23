/*
 * SPDX-License-Identifier: Apache-2.0
 */

// import { type Contract } from "fabric-contract-api";

// import { TestModelContract } from "./TestModelContract";

// export const contracts: (typeof Contract)[] = [TestModelContract];

import { TestPublicModelContract } from "./TestPublicModelContract";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
console.log(FabricCrudContract.name);

export const contracts: any[] = [TestPublicModelContract];
