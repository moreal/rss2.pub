import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Fixture = {
  readonly body: string;
  readonly contentType: string;
  readonly etag: string | null;
};

export type FixtureFeedServer = {
  /** Absolute URL of a fixture path on this server. */
  url(path: string): string;
  setFixture(
    path: string,
    body: string,
    options?: { readonly contentType?: string; readonly etag?: string },
  ): void;
  readonly requests: { path: string; headers: IncomingHttpHeaders }[];
  close(): Promise<void>;
};

/** Local HTTP server standing in for remote Atom origins in e2e tests. */
export async function startFixtureFeedServer(): Promise<FixtureFeedServer> {
  const fixtures = new Map<string, Fixture>();
  const requests: { path: string; headers: IncomingHttpHeaders }[] = [];

  const server: Server = createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push({ path, headers: req.headers });
    const fixture = fixtures.get(path);
    if (fixture === undefined) {
      res.writeHead(404).end("no fixture");
      return;
    }
    if (
      fixture.etag !== null &&
      req.headers["if-none-match"] === fixture.etag
    ) {
      res.writeHead(304, { etag: fixture.etag }).end();
      return;
    }
    res
      .writeHead(200, {
        "content-type": fixture.contentType,
        ...(fixture.etag === null ? {} : { etag: fixture.etag }),
      })
      .end(fixture.body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    setFixture(path, body, options) {
      fixtures.set(path, {
        body,
        contentType: options?.contentType ?? "application/atom+xml",
        etag: options?.etag ?? null,
      });
    },
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
