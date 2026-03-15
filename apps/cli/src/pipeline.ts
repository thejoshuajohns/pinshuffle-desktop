import fs from "node:fs";
import { AppConfig } from "@pinshuffle/core";
import { CliEnvironment } from "./environment";

export async function runPipelineCommand(
  env: CliEnvironment,
  options: {
    dryRun: boolean;
    resume?: boolean;
    startAt?: "auth" | "scrape" | "plan" | "apply";
    endAt?: "auth" | "scrape" | "plan" | "apply";
    maxPins?: number;
    configPath?: string;
  }
): Promise<void> {
  const config = loadConfigFromDisk(env, options.configPath);
  const unsubscribe = env.runner.eventBus.subscribe((event) => {
    switch (event.type) {
      case "step.started":
      case "step.completed":
      case "step.skipped":
        console.log(`[${event.step}] ${event.message}`);
        break;
      case "job.log":
        console.log(event.message);
        break;
      case "job.failed":
        console.error(event.message);
        break;
      default:
        break;
    }
  });

  try {
    const result = await env.runner.run(config, {
      dryRun: options.dryRun,
      resume: options.resume,
      startAt: options.startAt,
      endAt: options.endAt,
      maxPins: options.maxPins,
      configPath: options.configPath
    });

    console.log(`Job ${result.job.id} finished with status ${result.job.status}.`);
  } finally {
    unsubscribe();
  }
}

function loadConfigFromDisk(env: CliEnvironment, configPath?: string): AppConfig {
  if (configPath) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfig;
    return env.normalizeConfig(raw);
  }
  return env.configStore.load();
}
