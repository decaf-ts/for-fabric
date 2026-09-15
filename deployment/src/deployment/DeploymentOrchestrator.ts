/**
 * @module simple-deployment/deployment
 * @description This module defines the abstract base class for deployment orchestrators.
 * @summary It provides a common interface for different deployment orchestrators.
 * @category Deployment
 */

import { Logger, Logging } from "@decaf-ts/logging";
import { execSync } from "child_process";

/**
 * @class DeploymentOrchestrator
 * @abstract
 * @description Abstract base class for deployment orchestrators.
 * @summary Provides a common interface for different deployment orchestrators.
 * @category Deployment
 */
export abstract class DeploymentOrchestrator {
  protected logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? Logging.for(DeploymentOrchestrator.name);
  }

  /**
   * @method runFunction
   * @description Executes a command synchronously.
   * @param {string} command - The command to execute.
   * @param {object} env - The environment variables.
   * @returns {any} The result of the command execution.
   */
  runFunction(command: string, env: { [indexer: string]: any }): any {
    return execSync(command, env);
  }

  /**
   * @method executeCommand
   * @description Executes a command.
   * @param {string} command - The command to execute.
   * @param {object} [env={}] - The environment variables.
   * @returns {Promise<any>} A promise that resolves with the result of the command execution.
   */
  async executeCommand(
    command: string,
    env: Record<string, any> = {}
  ): Promise<any> {
    return this.runFunction(command, env);
  }

  /**
   * @method containerExists
   * @description Checks if a container exists.
   * @abstract
   * @param {string} name - The name of the container.
   * @param {string} [namespace] - The namespace of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container exists, `false` otherwise.
   */
  async containerExists(name: string, namespace?: string): Promise<boolean> {
    throw Error("Not implemented");
  }

  /**
   * @method isContainerRunning
   * @description Checks if a container is running.
   * @abstract
   * @param {string} name - The name of the container.
   * @param {string} [namespace] - The namespace of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container is running, `false` otherwise.
   */
  async isContainerRunning(name: string, namespace?: string): Promise<boolean> {
    throw Error("Not implemented");
  }

  /**
   * @method serviceUp
   * @description Brings a service up.
   * @abstract
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} config - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is up.
   */
  async serviceUp(
    projectName: string,
    stage: string,
    file: string,
    config: any
  ): Promise<any> {
    throw Error("Not implemented");
  }

  /**
   * @method serviceRestart
   * @description Restarts a service.
   * @abstract
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} config - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is restarted.
   */
  async serviceRestart(
    projectName: string,
    stage: string,
    file: string,
    config: any
  ): Promise<any> {
    throw Error("Not implemented");
  }

  /**
   * @method serviceDown
   * @description Brings a service down.
   * @abstract
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [env={}] - The environment variables.
   * @param {boolean} [remove=true] - Whether to remove the service.
   * @returns {Promise<any>} A promise that resolves when the service is down.
   */
  async serviceDown(
    projectName: string,
    stage: string,
    file: string,
    env: Record<string, any> = {},
    remove: boolean = true
  ): Promise<any> {
    throw new Error("Not implemented");
  }

  /**
   * @method executeInContainer
   * @description Executes a command in a container.
   * @abstract
   * @param {string} containerName - The name of the container.
   * @param {string[]} command - The command to execute.
   * @returns {Promise<any>} A promise that resolves with the result of the command execution.
   */
  async executeInContainer(
    containerName: string,
    command: string[]
  ): Promise<any> {
    throw new Error("Not implemented");
  }

  /**
   * @method awaitContainerReadiness
   * @description Awaits for a container to be ready.
   * @abstract
   * @param {string} containerName - The name of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container is ready, `false` otherwise.
   */
  async awaitContainerReadiness(containerName: string): Promise<boolean> {
    throw new Error("Not implemented");
  }

  /**
   * @method exec
   * @description Executes a command in a container.
   * @abstract
   * @param {string} containerName - The name of the container.
   * @param {string} cmd - The command to execute.
   * @param {string[]} envOverride - The environment variables to override.
   * @returns {Promise<any>} A promise that resolves with the result of the command execution.
   */
  async exec(
    containerName: string,
    cmd: string,
    envOverride: string[]
  ): Promise<any> {
    throw Error("Not implemented");
  }

  async getEnv(
    containerName: string,
    cmd: string,
    envOverride: string[]
  ): Promise<any> {
    throw Error("Not implemented");
  }

  /**
   * @method copyToAndFromContainer
   * @description Copies a file to or from a container.
   * @abstract
   * @param {string} containerName - The name of the container.
   * @param {string} originFile - The path to the origin file.
   * @param {string} dest - The path to the destination.
   * @param {"to" | "from"} [direction="to"] - The direction of the copy.
   * @returns {Promise<any>} A promise that resolves when the file is copied.
   */
  async copyToAndFromContainer(
    containerName: string,
    originFile: string,
    dest: string,
    direction: "to" | "from" = "to"
  ): Promise<any> {
    throw Error("Not implemented");
  }

  /**
   * @method serviceStart
   * @description Starts a service.
   * @abstract
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is started.
   */
  async serviceStart(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {}
  ): Promise<any> {
    throw Error("Not implemented");
  }

  /**
   * @method serviceStop
   * @description Stops a service.
   * @abstract
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is stopped.
   */
  async serviceStop(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {}
  ): Promise<any> {
    throw Error("Not implemented");
  }
}
