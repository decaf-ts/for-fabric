/**
 * @module simple-deployment/deployment
 * @description This module provides a Docker-based deployment orchestrator.
 * @summary It implements the {@link DeploymentOrchestrator} for Docker.
 * @category Deployment
 */

import Docker from "dockerode";
import { DeploymentOrchestrator } from "./DeploymentOrchestrator";
import { Logging } from "@decaf-ts/logging";

/**
 * @class DockerOrchestrator
 * @extends {DeploymentOrchestrator}
 * @description A Docker-based deployment orchestrator.
 * @summary Implements the {@link DeploymentOrchestrator} for Docker.
 * @category Deployment
 */
export class DockerOrchestrator extends DeploymentOrchestrator {
  private docker: Docker;

  constructor() {
    super(Logging.for(DockerOrchestrator.name));
    this.docker = new Docker({
      socketPath: process.env["DOCKER_SOCKET_PATH"] ?? "/var/run/docker.sock",
    });
  }

  /**
   * @method exec
   * @description Executes a command in a container.
   * @param {string} containerName - The name of the container.
   * @param {string} cmd - The command to execute.
   * @param {string[]} [envOverride] - The environment variables to override.
   * @returns {Promise<any>} A promise that resolves with the result of the command execution.
   */
  override async exec(
    containerName: string,
    cmd: string,
    envOverride?: string[]
  ) {
    const overrides =
      envOverride && envOverride.length > 0
        ? envOverride.map((el) => `-e ${el}`).join(" ") + " "
        : "";
    const command = `docker exec ${overrides}${containerName} bash -c '${cmd}'`;

    this.logger.info(`COMMAND: ${command}`);
    return await this.executeCommand(command);
  }

  override async getEnv(
    containerName: string,
    cmd: string,
    envOverride?: string[]
  ) {
    const overrides =
      envOverride && envOverride.length > 0
        ? envOverride.map((el) => `-e ${el}`).join(" ") + " "
        : "";
    const command = `docker exec ${overrides}${containerName} sh -c '${cmd}'`;

    this.logger.info(`COMMAND: ${command}`);
    return await this.executeCommand(command);
  }

  /**
   * @method copyToAndFromContainer
   * @description Copies a file to or from a container.
   * @param {string} containerName - The name of the container.
   * @param {string} originFile - The path to the origin file.
   * @param {string} dest - The path to the destination.
   * @param {"to" | "from"} [direction="to"] - The direction of the copy.
   * @returns {Promise<any>} A promise that resolves when the file is copied.
   */
  override async copyToAndFromContainer(
    containerName: string,
    originFile: string,
    dest: string,
    direction: "to" | "from" = "to"
  ) {
    const one =
      direction === "to" ? originFile : `${containerName}:${originFile}`;
    const two = direction === "to" ? `${containerName}:${dest}` : dest;
    const command = `docker cp ${one} ${two}`;

    return await this.executeCommand(command);
  }

  /**
   * @method executeInContainer
   * @description Executes a command in a container.
   * @param {string} containerName - The name of the container.
   * @param {string[]} command - The command to execute.
   * @returns {Promise<any>} A promise that resolves with the result of the command execution.
   */
  override async executeInContainer(
    containerName: string,
    command: string[]
  ): Promise<any> {
    const container = this.docker.getContainer(containerName);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});

    let stdout = "";
    let stderr = "";

    this.docker.modem.demuxStream(
      stream,
      {
        write: (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;
          this.logger.info(text.trimEnd());
        },
      } as any,
      {
        write: (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          // Treat STDERR as debug while streaming
          this.logger.debug(text.trimEnd());
        },
      } as any
    );

    return new Promise((resolve, reject) => {
      stream.on("error", reject);

      stream.on("end", async () => {
        try {
          const info = await exec.inspect();
          const exitCode = info.ExitCode ?? 0;

          // Now decide severity based on exit code
          if (exitCode !== 0) {
            if (stderr.trim()) this.logger.error(stderr.trim());
            const err = new Error(
              `Command '${command.join(" ")}' failed with exit code ${exitCode}\n${stderr || stdout}`
            );
            (err as any).stdout = stdout;
            (err as any).stderr = stderr;
            (err as any).exitCode = exitCode;
            reject(err);
            return;
          }

          // On success you can optionally log stderr at debug
          if (stderr.trim()) this.logger.debug(stderr.trim());

          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * @method awaitContainerReadiness
   * @description Awaits for a container to be ready.
   * @param {string} containerName - The name of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container is ready, `false` otherwise.
   */
  override async awaitContainerReadiness(
    containerName: string
  ): Promise<boolean> {
    const container = this.docker.getContainer(containerName);
    const data = await container.inspect();

    if (!data.State.Health) {
      throw new EvalError(
        `No health check defined for container '${containerName}'.`
      );
    }

    const healthStatus = data.State.Health.Status;
    this.logger.info(
      `Container '${containerName}' health status: ${healthStatus}`
    );

    if (healthStatus === "healthy") {
      return true;
    } else {
      if (healthStatus === "unhealthy") throw new Error("Unhealthy container");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return this.awaitContainerReadiness(containerName);
    }
  }

  /**
   * @method serviceStart
   * @description Starts a service.
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is started.
   */
  override async serviceStart(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {}
  ): Promise<any> {
    const command = `docker compose -p ${projectName} --profile ${stage} -f ${file} start`;
    return await this.executeCommand(command, config);
  }

  /**
   * @method serviceRestart
   * @description Restarts a service.
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is restarted.
   */
  override async serviceRestart(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {}
  ): Promise<any> {
    const command = `docker compose -p ${projectName} --profile ${stage} -f ${file} restart`;
    return await this.executeCommand(command, config);
  }

  /**
   * @method serviceStop
   * @description Stops a service.
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is stopped.
   */
  override async serviceStop(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {}
  ): Promise<any> {
    const command = `docker compose -p ${projectName} --profile ${stage} -f ${file} stop`;
    return await this.executeCommand(command, config);
  }

  /**
   * @method serviceDown
   * @description Brings a service down.
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} [config={}] - The environment variables.
   * @param {boolean} [remove=true] - Whether to remove the service.
   * @returns {Promise<any>} A promise that resolves when the service is down.
   */
  override async serviceDown(
    projectName: string,
    stage: string,
    file: string,
    config: Record<string, any> = {},
    remove: boolean = true
  ): Promise<any> {
    const command = `docker compose -p ${projectName} --profile ${stage} -f ${file} down ${remove ? "--rmi local -v" : ""}`;
    return await this.executeCommand(command, config);
  }

  /**
   * @method serviceUp
   * @description Brings a service up.
   * @param {string} projectName - The name of the project.
   * @param {string} stage - The deployment stage.
   * @param {string} file - The deployment file.
   * @param {object} config - The deployment configuration.
   * @returns {Promise<any>} A promise that resolves when the service is up.
   */
  override async serviceUp(
    projectName: string,
    stage: string,
    file: string,
    config: any
  ): Promise<any> {
    const command = `docker compose -p ${projectName} --profile ${stage} -f ${file} up -d`;
    return await this.executeCommand(command, config);
  }

  /**
   * @method containerExists
   * @description Checks if a container exists.
   * @param {string} name - The name of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container exists, `false` otherwise.
   */
  override async containerExists(name: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(name);
      await container.inspect();
      return true;
    } catch (err: any) {
      if (err.statusCode === 404) return false;
      throw err;
    }
  }

  /**
   * @method isContainerRunning
   * @description Checks if a container is running.
   * @param {string} name - The name of the container.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the container is running, `false` otherwise.
   */
  override async isContainerRunning(name: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(name).inspect();
      return info.State?.Running === true;
    } catch (err: any) {
      if (err.statusCode === 404) return false;
      throw err;
    }
  }
}
