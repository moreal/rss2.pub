import { isOk, type Result } from "../../src/shared/result.js";

/** Unwraps an Ok or fails the test with the error payload. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!isOk(result)) {
    throw new Error(`expected Ok, got Err: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Unwraps an Err or fails the test with the success payload. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isOk(result)) {
    throw new Error(`expected Err, got Ok: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}
