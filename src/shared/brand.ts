declare const brand: unique symbol;

/**
 * Nominal (branded) type: `Brand<string, "FeedId">` is assignable to `string`
 * but a plain `string` is not assignable to it. Values are only produced by
 * the owning module's smart constructor, so holding the type proves the value
 * passed validation ("parse, don't validate").
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
