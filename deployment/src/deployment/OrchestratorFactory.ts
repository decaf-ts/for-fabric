/**
 * @module simple-deployment/deployment
 * @description Factory for creating deployment orchestrators.
 */

import { Logging } from "@decaf-ts/logging";
import { DeploymentPlatform } from "./constants";
import { DeploymentOrchestrator } from "./DeploymentOrchestrator";
import { DockerOrchestrator } from "./DockerOrchestrator";

export class OrchestratorFactory {
  static getPlatform(): DeploymentPlatform {
    const logger = Logging.for(this.getPlatform);
    let platform = process.env["DEPLOYMENT_PLATFORM"];

    if (!platform) {
      logger.warn(
        "DEPLOYMENT_PLATFORM is not set. Defaulting to 'docker' platform."
      );
      platform = DeploymentPlatform.Docker;
    }

    switch (platform) {
      case DeploymentPlatform.Docker:
        return DeploymentPlatform.Docker;
      default:
        throw new Error(`Unsupported deployment platform: ${platform}`);
    }
  }

  static getOrchestrator(): DeploymentOrchestrator {
    const platform: DeploymentPlatform = OrchestratorFactory.getPlatform();

    switch (platform) {
      case DeploymentPlatform.Docker:
        return new DockerOrchestrator();
      default:
        throw new Error(`Unsupported deployment platform: ${platform}`);
    }
  }
}
