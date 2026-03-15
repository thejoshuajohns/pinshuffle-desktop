import { Command } from "commander";
import { runPinterestDiagnostics } from "@pinshuffle/scraper-pinterest";
import { parseInteger } from "../parsers";

export function registerDoctorCommands(program: Command): void {
  program
    .command("doctor")
    .description("Run Pinterest selector diagnostics.")
    .option("--pin-url <url>", "Optional pin URL to inspect.")
    .option("--timeout-ms <ms>", "Selector timeout in milliseconds.", "3000")
    .action(async (options: { pinUrl?: string; timeoutMs: string }) => {
      const report = await runPinterestDiagnostics({
        pinUrl: options.pinUrl,
        timeoutMs: parseInteger(options.timeoutMs, "timeout-ms")
      });

      console.log(
        `Pinterest selector diagnostics: ${report.checks.filter((check) => check.ok).length}/${report.checks.length} passed.`
      );
      for (const check of report.checks) {
        console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} - ${check.note}`);
      }
    });

  program
    .command("diagnose")
    .description("Compatibility alias for doctor.")
    .action(async () => {
      await program.parseAsync(["node", "pinshuffle", "doctor"], { from: "user" });
    });
}
