import { Command } from "commander";
import { CliEnvironment } from "../environment";
import { parseInteger } from "../parsers";

export function registerAuthCommands(program: Command, env: CliEnvironment): void {
  program
    .command("login")
    .description("Launch headed browser and save Playwright storage state after manual login.")
    .option("--prompt", "Wait for Enter in terminal after manual login.", true)
    .option("--no-prompt", "Auto-detect login without waiting for Enter.")
    .option("--timeout-ms <ms>", "Timeout for login detection in milliseconds.", "600000")
    .action(async (options: { prompt?: boolean; timeoutMs: string }) => {
      await env.authService.login({
        promptForEnter: Boolean(options.prompt),
        timeoutMs: parseInteger(options.timeoutMs, "timeout-ms")
      });
    });

  program
    .command("auth-check")
    .description("Validate that saved auth state is still authenticated.")
    .option("--timeout-ms <ms>", "Timeout for auth check navigation in milliseconds.", "30000")
    .option("--quiet", "Suppress success output and rely on exit code.", false)
    .action(async (options: { timeoutMs: string; quiet?: boolean }) => {
      const result = await env.authService.checkStoredAuth(
        parseInteger(options.timeoutMs, "timeout-ms")
      );
      if (result.authenticated) {
        if (!options.quiet) {
          console.log("Pinterest auth session is valid.");
        }
        return;
      }

      if (!options.quiet) {
        console.error(`Pinterest auth session is invalid: ${result.reason}`);
      }
      process.exitCode = 1;
    });

  program
    .command("logout")
    .description("Delete saved Playwright auth state.")
    .action(() => {
      const removed = env.authService.clearStoredAuth();
      console.log(removed ? "Removed saved auth state." : "No saved auth state found.");
    });
}
