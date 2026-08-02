import { describe, expect, it } from "vitest";
import {
  all,
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
  type Result,
} from "../../../src/shared/result.js";

type ParseError = { readonly type: "NotANumber"; readonly raw: string };

function parseNumber(raw: string): Result<number, ParseError> {
  const value = Number(raw);
  return Number.isNaN(value) ? err({ type: "NotANumber", raw }) : ok(value);
}

describe("Result", () => {
  it("ok produces a success carrying the value", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it("err produces a failure carrying the error", () => {
    const result = err({ type: "NotANumber", raw: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ type: "NotANumber", raw: "abc" });
  });

  it("isOk / isErr narrow the union", () => {
    const success: Result<number, ParseError> = parseNumber("7");
    const failure: Result<number, ParseError> = parseNumber("abc");

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);

    if (isOk(success)) expect(success.value).toBe(7);
    if (isErr(failure)) expect(failure.error.type).toBe("NotANumber");
  });

  it("map transforms only success values", () => {
    expect(map(parseNumber("3"), (n) => n * 2)).toEqual(ok(6));

    const failure = parseNumber("abc");
    expect(map(failure, (n) => n * 2)).toBe(failure);
  });

  it("mapErr transforms only errors", () => {
    const success = parseNumber("3");
    expect(mapErr(success, (e) => e.type)).toBe(success);

    expect(mapErr(parseNumber("abc"), (e) => e.type)).toEqual(
      err("NotANumber"),
    );
  });

  it("andThen chains result-producing functions and short-circuits", () => {
    const positive = (n: number): Result<number, ParseError> =>
      n > 0 ? ok(n) : err({ type: "NotANumber", raw: String(n) });

    expect(andThen(parseNumber("5"), positive)).toEqual(ok(5));
    expect(andThen(parseNumber("-5"), positive)).toEqual(
      err({ type: "NotANumber", raw: "-5" }),
    );

    const failure = parseNumber("abc");
    expect(andThen(failure, positive)).toBe(failure);
  });

  it("unwrapOr falls back only on failure", () => {
    expect(unwrapOr(parseNumber("9"), 0)).toBe(9);
    expect(unwrapOr(parseNumber("abc"), 0)).toBe(0);
  });

  it("all collects successes in order", () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
  });

  it("all returns the first failure", () => {
    const first = err({ type: "NotANumber", raw: "a" } as const);
    const second = err({ type: "NotANumber", raw: "b" } as const);
    expect(all<number, ParseError>([ok(1), first, second])).toBe(first);
  });
});
