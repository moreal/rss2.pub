import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../src/shared/sha256.js";

// NIST / well-known vectors.
describe("sha256", () => {
  it("hashes the empty string", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('hashes "abc"', () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it('hashes "hello world"', () => {
    expect(sha256Hex("hello world")).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("hashes the two-block NIST vector", () => {
    expect(
      sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("handles multi-byte UTF-8 input", () => {
    // echo -n "피드" | shasum -a 256
    expect(sha256Hex("피드")).toBe(
      "265ff0ce116f97c29f2a0d0bb0b9552113a0d33077a41172bb9f407dbc6d1bf3",
    );
  });

  it("handles input straddling the 55/56-byte padding boundary", () => {
    const fiftyFive = "a".repeat(55);
    const fiftySix = "a".repeat(56);
    expect(sha256Hex(fiftyFive)).toBe(
      "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
    );
    expect(sha256Hex(fiftySix)).toBe(
      "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
    );
  });
});
