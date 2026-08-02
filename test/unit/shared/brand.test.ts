import { describe, expectTypeOf, it } from "vitest";
import type { Brand } from "../../../src/shared/brand.js";

type FeedId = Brand<string, "FeedId">;
type ItemId = Brand<string, "ItemId">;

describe("Brand", () => {
  it("branded values are assignable to their base type but not vice versa", () => {
    expectTypeOf<FeedId>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<FeedId>();
  });

  it("distinct brands over the same base type are not interchangeable", () => {
    expectTypeOf<FeedId>().not.toExtend<ItemId>();
    expectTypeOf<ItemId>().not.toExtend<FeedId>();
  });
});
