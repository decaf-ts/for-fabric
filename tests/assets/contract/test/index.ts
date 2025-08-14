/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from "fabric-contract-api";

import { TestSerializedContract } from "./TestSerializedContract";

export const contracts: (typeof Contract)[] = [TestSerializedContract];
