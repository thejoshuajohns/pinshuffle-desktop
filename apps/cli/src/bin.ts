#!/usr/bin/env node

import { Command } from "commander";
import { createCliEnvironment } from "./environment";
import {
  registerRunCommands,
  registerAuthCommands,
  registerInitCommand,
  registerShuffleCommand,
  registerDoctorCommands
} from "./commands";

const program = new Command();
const environment = createCliEnvironment();

program
  .name("pinshuffle")
  .description("Resumable Pinterest board shuffler with a formal job pipeline.")
  .version("2.0.0");

registerRunCommands(program, environment);
registerAuthCommands(program, environment);
registerInitCommand(program, environment);
registerShuffleCommand(program, environment);
registerDoctorCommands(program);

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
