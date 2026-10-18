import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@tau/plugins/sync", () => ({
  defineSyncProvider: (
    definition: import("@tau/plugins/sync").SyncProviderDefinition,
  ) => definition,
}));
import storage from "./sync";
import type { SyncProvider } from "@tau/plugins/sync";

let server: Server, provider: SyncProvider;
const objects = new Map<string, Buffer>();
const requests: {
  method: string;
  key: string;
  signed: boolean;
  condition?: string;
}[] = [];
const bytes = (value: string) => new TextEncoder().encode(value);
beforeEach(async () => {
  objects.clear();
  requests.length = 0;
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const key = decodeURIComponent(url.pathname.replace(/^\/bucket\//, ""));
    requests.push({
      method: req.method ?? "",
      key,
      signed: !!req.headers.authorization,
      condition: req.headers["if-none-match"] as string | undefined,
    });
    const fail = (status: number, code: string) => {
      res.writeHead(status, { "Content-Type": "application/xml" });
      res.end(
        "<Error><Code>" + code + "</Code><Message>test</Message></Error>",
      );
    };
    if (!req.headers.authorization) return fail(403, "AccessDenied");
    if (
      key.endsWith("denied") ||
      url.searchParams.get("prefix")?.endsWith("denied")
    )
      return fail(403, "AccessDenied");
    if (key.endsWith("unsupported")) return fail(400, "NotImplemented");
    if (req.method === "GET" && url.searchParams.has("list-type")) {
      const prefix = url.searchParams.get("prefix") ?? "",
        offset = Number(url.searchParams.get("continuation-token") ?? 0);
      const keys = [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort();
      const selected = keys.slice(offset, offset + 1),
        more = offset + 1 < keys.length;
      res.setHeader("Content-Type", "application/xml");
      return res.end(
        "<ListBucketResult><IsTruncated>" +
          more +
          "</IsTruncated>" +
          (more
            ? "<NextContinuationToken>" +
              (offset + 1) +
              "</NextContinuationToken>"
            : "") +
          selected
            .map(
              (key) =>
                "<Contents><Key>" +
                key +
                "</Key><Size>" +
                objects.get(key)!.length +
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
    const content = objects.get(key);
    if (!content) return fail(404, "NoSuchKey");
    res.setHeader("Content-Length", content.length);
    res.setHeader("ETag", '"test"');
    res.end(req.method === "HEAD" ? undefined : content);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server");
  provider = storage.create({
    endpoint: "http://127.0.0.1:" + address.port,
    bucket: "bucket",
    region: "test-region",
    accessKeyId: "test-only",
    secretAccessKey: "test-only",
    urlStyle: "path",
    pathPrefix: "/sync",
  });
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

it("私有桶读写均使用签名，普通覆盖不加条件头", async () => {
  expect(await provider.uploadFile("data", bytes("first"))).toBe(true);
  expect(await provider.fileExists("data")).toBe(true);
  expect(new TextDecoder().decode(await provider.downloadFile("data"))).toBe(
    "first",
  );
  expect(await provider.uploadFile("data", bytes("second"))).toBe(true);
  expect(objects.get("sync/data")?.toString()).toBe("second");
  expect(
    requests
      .filter((item) => item.method === "PUT")
      .every((item) => item.signed && !item.condition),
  ).toBe(true);
  expect(
    requests
      .filter((item) => item.method === "GET" || item.method === "HEAD")
      .every((item) => item.signed),
  ).toBe(true);
});
it("条件创建返回boolean，冲突或请求失败沿用false，不覆盖已有对象", async () => {
  const result = await Promise.all(
    ["one", "two"].map((value) =>
      provider.createFileIfAbsent("head", bytes(value)),
    ),
  );
  expect(result.filter(Boolean)).toHaveLength(1);
  expect(["one", "two"]).toContain(objects.get("sync/head")?.toString());
  expect(requests.every((item) => item.condition === "*")).toBe(true);
  expect(await provider.createFileIfAbsent("unsupported", bytes("test"))).toBe(
    false,
  );
  expect(await provider.uploadFile("denied", bytes("test"))).toBe(false);
});
it("分页在插件内部聚合，保留列表字段与旧桌面失败处理", async () => {
  await provider.uploadFile("folder/a", bytes("a"));
  await provider.uploadFile("folder/b", bytes("bb"));
  expect(await provider.listFiles("folder/")).toMatchObject([
    { name: "a", path: "folder/a", size: 1 },
    { name: "b", path: "folder/b", size: 2 },
  ]);
  expect(await provider.listFiles("denied")).toEqual([]);
});
it("不存在返回false，读取失败和无权限仍抛错", async () => {
  expect(await provider.fileExists("missing")).toBe(false);
  await expect(provider.downloadFile("missing")).rejects.toMatchObject({
    $metadata: { httpStatusCode: 404 },
  });
  await expect(provider.fileExists("denied")).rejects.toMatchObject({
    $metadata: { httpStatusCode: 403 },
  });
  await expect(provider.downloadFile("denied")).rejects.toMatchObject({
    $metadata: { httpStatusCode: 403 },
  });
});
