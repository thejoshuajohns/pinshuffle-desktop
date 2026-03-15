import { Command } from "commander";
import { CliEnvironment } from "../environment";
import { parseInteger } from "../parsers";
import { runPipelineCommand } from "../pipeline";

export function registerRunCommands(program: Command, env: CliEnvironment): void {
  program
    .command("run")
    .description("Run Auth -> Scrape -> Plan -> Apply.")
    .option("--dry-run", "Preview only, do not publish pins.", false)
    .option("--resume", "Resume the latest job when possible.", true)
    .option("--no-resume", "Start a fresh job instead of resuming.")
    .option("--config <path>", "Optional config path.")
    .option("--max <count>", "Process only the first N planned pins during apply.")
    .action(async (options: { dryRun?: boolean; resume?: boolean; config?: string; max?: string }) => {
      await runPipelineCommand(env, {
        dryRun: Boolean(options.dryRun),
        resume: Boolean(options.resume),
        configPath: options.config,
        maxPins: options.max ? parseInteger(options.max, "max") : undefined
      });
    });

  program
    .command("preview")
    .description("Run the full pipeline in dry-run mode.")
    .option("--resume", "Resume the latest job when possible.", true)
    .option("--no-resume", "Start a fresh preview job.")
    .option("--config <path>", "Optional config path.")
    .action(async (options: { resume?: boolean; config?: string }) => {
      await runPipelineCommand(env, {
        dryRun: true,
        resume: Boolean(options.resume),
        configPath: options.config
      });
    });

  program
    .command("scrape")
    .description("Run Auth -> Scrape and persist pins artifacts.")
    .option("--resume", "Resume the latest job when possible.", true)
    .option("--no-resume", "Start a fresh scrape job.")
    .action(async (options: { resume?: boolean }) => {
      await runPipelineCommand(env, {
        dryRun: true,
        resume: Boolean(options.resume),
        endAt: "scrape"
      });
    });

  program
    .command("apply")
    .description("Run only the Apply step for the current job plan.")
    .option("--dry-run", "Preview only, do not publish pins.", false)
    .option("--resume", "Resume the latest job when possible.", true)
    .option("--no-resume", "Ignore previous apply checkpoint.")
    .option("--max <count>", "Process only the first N planned pins.")
    .action(async (options: { dryRun?: boolean; resume?: boolean; max?: string }) => {
      await runPipelineCommand(env, {
        dryRun: Boolean(options.dryRun),
        resume: Boolean(options.resume),
        startAt: "apply",
        endAt: "apply",
        maxPins: options.max ? parseInteger(options.max, "max") : undefined
      });
    });

  program
    .command("plan")
    .description("Run only the plan step for the current job.")
    .action(async () => {
      await runPipelineCommand(env, {
        dryRun: true,
        startAt: "plan",
        endAt: "plan"
      });
    });
}
