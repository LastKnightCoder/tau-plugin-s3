import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it } from "vitest";
import storage from "./sync";
import type { SyncStorageConnection } from "@tau/plugins/sync";

let server: Server, connection: SyncStorageConnection;
const objects = new Map<string, Buffer>();
const requests: { method: string; key: string; signed: boolean }[] = [];
const options = () => ({ signal: new AbortController().signal });
const source = (text: string) => ({
  size: Buffer.byteLength(text),
  open: () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(Buffer.from(text));
        c.close();
      },
    }),
});
beforeEach(async () => {
  objects.clear();
  requests.length = 0;
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = decodeURIComponent(url.pathname.replace(/^\/bucket\//, ""));
    requests.push({
      method: req.method ?? "",
      key,
      signed:
        req.headers.authorization?.startsWith("AWS4-HMAC-SHA256") ?? false,
    });
    const fail = (status: number, code: string) => {
      res.writeHead(status, { "Content-Type": "application/xml" });
      res.end(
        "<Error><Code>" + code + "</Code><Message>test</Message></Error>",
      );
    };
    if (key.endsWith("denied")) return fail(403, "AccessDenied");
    if (key.endsWith("unsupported")) return fail(400, "NotImplemented");
    if (req.method === "GET" && url.searchParams.has("list-type")) {
      const prefix = url.searchParams.get("prefix") ?? "",
        offset = Number(url.searchParams.get("continuation-token") ?? 0),
        limit = Number(url.searchParams.get("max-keys") ?? 1000);
      const keys = [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .sort(),
        selected = keys.slice(offset, offset + limit),
        more = offset + limit < keys.length;
      res.setHeader("Content-Type", "application/xml");
      return res.end(
        "<ListBucketResult><IsTruncated>" +
          more +
          "</IsTruncated>" +
          (more
            ? "<NextContinuationToken>" +
              (offset + limit) +
              "</NextContinuationToken>"
            : "") +
          selected
            .map(
              (k) =>
                "<Contents><Key>" +
                k +
                "</Key><Size>" +
                objects.get(k)!.length +
                "</Size></Contents>",
            )
            .join("") +
          "</ListBucketResult>",
      );
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.headers["if-none-match"] === "*" && objects.has(key))
        return fail(412, "PreconditionFailed");
      objects.set(key, Buffer.concat(chunks));
      res.setHeader("ETag", '"test"');
      return res.end();
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      res.statusCode = 204;
      return res.end();
    }
    const content = objects.get(key);
    if (!content) return fail(404, "NoSuchKey");
    res.setHeader("Content-Length", content.length);
    res.setHeader("ETag", '"test"');
    return res.end(req.method === "HEAD" ? undefined : content);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server");
  connection = await storage.open(
    {
      endpoint: "http://127.0.0.1:" + address.port,
      bucket: "bucket",
      region: "test-region",
      accessKeyId: "test-only",
      secretAccessKey: "test-only",
      urlStyle: "path",
      pathPrefix: "/sync",
    },
    options(),
  );
});
afterEach(async () => {
  await connection?.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
it("签名读写与原子创建；并发仅一人成功，重复不覆盖", async () => {
  const result = await Promise.all(
    ["one", "two"].map((value) =>
      connection.write("head", source(value), {
        ...options(),
        mode: "create-only",
      }),
    ),
  );
  expect(result.map((item) => item.status).sort()).toEqual([
    "already-exists",
    "written",
  ]);
  expect(await connection.stat("head", options())).toMatchObject({
    key: "head",
    size: 3,
  });
  const read = await connection.read("head", options());
  expect(read).not.toBeNull();
  expect(["one", "two"]).toContain(await new Response(read!.body).text());
  expect(requests.every((request) => request.signed)).toBe(true);
  await connection.write("head", source("new"), {
    ...options(),
    mode: "replace",
  });
  expect(objects.get("sync/head")?.toString()).toBe("new");
});
it("分页返回相对键，删除幂等；不存在与403分离", async () => {
  for (const key of ["a", "b"])
    await connection.write(key, source(key), { ...options(), mode: "replace" });
  const page = await connection.list("", { ...options(), limit: 1 });
  expect(page.items[0].key).toBe("a");
  expect(page.nextCursor).toBeTruthy();
  const second = await connection.list("", {
    ...options(),
    limit: 1,
    cursor: page.nextCursor!,
  });
  expect(second.items[0].key).toBe("b");
  expect(second.nextCursor).toBeNull();
  await connection.remove("a", options());
  await connection.remove("a", options());
  expect(await connection.read("a", options())).toBeNull();
  expect(await connection.stat("missing", options())).toBeNull();
  await expect(connection.read("denied", options())).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(connection.stat("denied", options())).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(
    connection.write("unsupported", source("test"), {
      ...options(),
      mode: "create-only",
    }),
  ).rejects.toMatchObject({
    code: "unsupported",
  });
});
it("取消和dispose阻止后续传输，不吞成对象不存在", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    connection.stat("missing", { signal: controller.signal }),
  ).rejects.toMatchObject({ code: "cancelled" });
  await expect(
    connection.write("missing", source("cancel"), {
      signal: controller.signal,
      mode: "replace",
    }),
  ).rejects.toMatchObject({ code: "cancelled" });
  await connection.dispose();
  await expect(connection.read("missing", options())).rejects.toMatchObject({
    code: "cancelled",
  });
});
it("取得下载响应后取消仍终止内容流", async () => {
  objects.set("sync/large", Buffer.alloc(256 * 1024, 1));
  const controller = new AbortController();
  const response = await connection.read("large", {
    signal: controller.signal,
  });
  expect(response).not.toBeNull();
  controller.abort();
  await expect(new Response(response!.body).arrayBuffer()).rejects.toThrow();
});
