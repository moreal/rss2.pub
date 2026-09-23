import { createServer } from "node:http";
import { once } from "node:events";
import { fetch } from "undici";
import { expect, it } from "vitest";
import { createAddressGuardedAgent } from "../../src/infrastructure/feedfetch/public-fetch.js";

it("checks the DNS address used for the actual socket", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end("ok");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing test port");
  const resolve = async () => [{ address: "127.0.0.1", family: 4 }];
  const guarded = createAddressGuardedAgent(false, resolve);
  const allowed = createAddressGuardedAgent(true, resolve);
  try {
    const url = `http://rebind.example:${address.port}/feed`;
    await expect(fetch(url, { dispatcher: guarded })).rejects.toThrow();
    expect(requests).toBe(0);
    const response = await fetch(url, { dispatcher: allowed });
    expect(await response.text()).toBe("ok");
    expect(requests).toBe(1);
  } finally {
    await guarded.close();
    await allowed.close();
    server.close();
  }
});
