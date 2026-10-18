import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  defineSyncStorage,
  SyncStorageError,
  type SyncStorageConnection,
  type SyncTransferOptions,
} from "@tau/plugins/sync";

interface Config {
  endpoint?: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlStyle: "path" | "virtualHosted";
}
function parse(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SyncStorageError("invalid-config", "S3配置无效");
  const input = value as Record<string, unknown>;
  for (const name of ["region", "bucket", "accessKeyId", "secretAccessKey"])
    if (typeof input[name] !== "string" || !(input[name] as string).trim())
      throw new SyncStorageError(
        "invalid-config",
        "请填写区域、Bucket和访问凭据",
      );
  if (input.endpoint !== undefined && input.endpoint !== "") {
    try {
      const url = new URL(String(input.endpoint));
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new SyncStorageError("invalid-config", "S3 Endpoint无效");
    }
  }
  const pathPrefix = String(input.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
  if (pathPrefix.split("/").some((part) => part === ".." || part === "."))
    throw new SyncStorageError("invalid-config", "S3路径前缀无效");
  if (
    input.urlStyle !== undefined &&
    !["path", "virtualHosted"].includes(String(input.urlStyle))
  )
    throw new SyncStorageError("invalid-config", "S3地址模式无效");
  return {
    region: String(input.region),
    bucket: String(input.bucket),
    accessKeyId: String(input.accessKeyId),
    secretAccessKey: String(input.secretAccessKey),
    endpoint: input.endpoint ? String(input.endpoint) : undefined,
    pathPrefix,
    urlStyle: input.urlStyle === "virtualHosted" ? "virtualHosted" : "path",
  };
}
function status(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}
function sizeOf(value: number | undefined) {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0)
    throw new SyncStorageError("unavailable", "S3返回的对象大小无效");
  return value;
}
function failure(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) throw new SyncStorageError("cancelled", "S3传输已取消");
  if (error instanceof SyncStorageError) throw error;
  const code = status(error);
  const serviceCode =
    (error as { Code?: string; name?: string })?.Code ??
    (error as { name?: string })?.name;
  if (code === 501 || serviceCode === "NotImplemented")
    throw new SyncStorageError("unsupported", "存储服务不支持请求的S3操作");
  if (code === 401) throw new SyncStorageError("unauthorized", "S3认证失败");
  if (code === 403)
    throw new SyncStorageError("forbidden", "S3拒绝访问，请检查凭据和权限");
  if (code === 429 || code === 503)
    throw new SyncStorageError("rate-limited", "S3限流或暂不可用，请稍后重试");
  throw new SyncStorageError(
    "unavailable",
    "S3请求失败，写入结果可能未知，请重新检查",
  );
}
function progressStream(
  body: ReadableStream<Uint8Array>,
  options: SyncTransferOptions,
  total: number,
) {
  let transferred = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        options.signal.throwIfAborted();
        transferred += chunk.byteLength;
        options.onProgress?.({ transferred, total });
        controller.enqueue(chunk);
      },
    }),
    { signal: options.signal },
  );
}

export default defineSyncStorage({
  id: "tau.sync-s3",
  name: "S3 兼容存储",
  async open(input, { signal: owner }) {
    const config = parse(input),
      lifetime = new AbortController();
    owner.throwIfAborted();
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.urlStyle === "path",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const keyOf = (key: string) => {
      if (
        !key ||
        key.startsWith("/") ||
        key.includes("\\") ||
        key.split("/").some((part) => part === ".." || part === ".")
      )
        throw new SyncStorageError("invalid-config", "远端对象名无效");
      return config.pathPrefix ? config.pathPrefix + "/" + key : key;
    };
    const signalOf = (options: SyncTransferOptions) =>
      AbortSignal.any([owner, lifetime.signal, options.signal]);
    const target = JSON.stringify([
      config.endpoint ?? "",
      config.region,
      config.bucket,
      config.pathPrefix,
      config.urlStyle,
    ]);
    const connection: SyncStorageConnection = {
      target: {
        identity: createHash("sha256").update(target).digest("hex"),
        label:
          config.bucket + (config.pathPrefix ? "/" + config.pathPrefix : ""),
      },
      async stat(key, options) {
        const signal = signalOf(options);
        try {
          const result = await client.send(
            new HeadObjectCommand({ Bucket: config.bucket, Key: keyOf(key) }),
            { abortSignal: signal },
          );
          return {
            key,
            size: sizeOf(result.ContentLength),
            modifiedAt: result.LastModified?.getTime(),
          };
        } catch (error) {
          if (!signal.aborted && status(error) === 404) return null;
          return failure(error, signal);
        }
      },
      async read(key, options) {
        const signal = signalOf(options);
        try {
          const result = await client.send(
            new GetObjectCommand({ Bucket: config.bucket, Key: keyOf(key) }),
            { abortSignal: signal },
          );
          if (!result.Body) throw new Error("empty body");
          const info = {
            key,
            size: sizeOf(result.ContentLength),
            modifiedAt: result.LastModified?.getTime(),
          };
          return {
            info,
            body: progressStream(
              result.Body.transformToWebStream(),
              { ...options, signal },
              info.size,
            ),
          };
        } catch (error) {
          if (!signal.aborted && status(error) === 404) return null;
          return failure(error, signal);
        }
      },
      async write(key, source, options) {
        const signal = signalOf(options);
        if (signal.aborted)
          throw new SyncStorageError("cancelled", "S3传输已取消");
        const body = Readable.fromWeb(
          progressStream(
            source.open(),
            { ...options, signal },
            source.size,
          ) as import("node:stream/web").ReadableStream<Uint8Array>,
        );
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: keyOf(key),
              Body: body,
              ContentLength: source.size,
              ...(options.mode === "create-only" ? { IfNoneMatch: "*" } : {}),
            }),
            { abortSignal: signal },
          );
          return { status: "written" };
        } catch (error) {
          if (
            !signal.aborted &&
            options.mode === "create-only" &&
            status(error) === 412
          )
            return { status: "already-exists" };
          return failure(error, signal);
        } finally {
          body.destroy();
        }
      },
      async list(prefix, options) {
        const signal = signalOf(options);
        if (
          !Number.isInteger(options.limit) ||
          options.limit < 1 ||
          options.limit > 1000
        )
          throw new SyncStorageError("invalid-config", "分页大小必须为1至1000");
        const base = config.pathPrefix ? config.pathPrefix + "/" : "";
        try {
          const result = await client.send(
            new ListObjectsV2Command({
              Bucket: config.bucket,
              Prefix: prefix ? keyOf(prefix) : base,
              MaxKeys: options.limit,
              ContinuationToken: options.cursor,
            }),
            { abortSignal: signal },
          );
          if (result.IsTruncated && !result.NextContinuationToken)
            throw new Error("missing cursor");
          return {
            items: (result.Contents ?? [])
              .filter(
                (item) => item.Key?.startsWith(base) && !item.Key.endsWith("/"),
              )
              .map((item) => ({
                key: item.Key!.slice(base.length),
                size: sizeOf(item.Size),
                modifiedAt: item.LastModified?.getTime(),
              })),
            nextCursor: result.IsTruncated
              ? result.NextContinuationToken!
              : null,
          };
        } catch (error) {
          return failure(error, signal);
        }
      },
      async remove(key, options) {
        const signal = signalOf(options);
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: config.bucket, Key: keyOf(key) }),
            { abortSignal: signal },
          );
        } catch (error) {
          if (!signal.aborted && status(error) === 404) return;
          failure(error, signal);
        }
      },
      async dispose() {
        lifetime.abort();
        client.destroy();
      },
    };
    return connection;
  },
});
