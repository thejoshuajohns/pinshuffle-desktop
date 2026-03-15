import { SerializedError } from "./types";

export class PinShuffleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PinShuffleError";
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof PinShuffleError) {
    return {
      message: error.message,
      stack: error.stack,
      code: error.code
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}
