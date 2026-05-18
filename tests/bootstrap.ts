import { Adapter } from "@decaf-ts/core";
import { FabricFlavour } from "../src/shared/constants";

import "../src/contracts/bootstrap";

// Ensure Fabric-specific adapter behavior is active before any model modules evaluate.
Adapter.setCurrent(FabricFlavour);
