import pino, { Logger } from "pino";

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.PINSHUFFLE_LOG_LEVEL ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
