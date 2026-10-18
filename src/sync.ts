import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { SyncProvider, RemoteFileInfo } from "@tau/plugins/sync";
import type { HttpRequest, HttpHandlerOptions } from "@smithy/types";

interface Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  pathPrefix: string;
}

function parse(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("S3配置无效");
  const config = value as Record<string, unknown>;
  for (const field of ["accessKeyId", "secretAccessKey", "bucket", "region"])
    if (typeof config[field] !== "string" || !config[field])
      throw new Error("请填写S3凭据、桶和区域");
  return {
    ...(config as unknown as Config),
    pathPrefix: typeof config.pathPrefix === "string" ? config.pathPrefix : "",
  };
}

export class S3SyncProvider implements SyncProvider {
  constructor(
    private readonly config: Config,
    private readonly fetch: typeof globalThis.fetch,
  ) {}
  private client() {
    return new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      forcePathStyle: this.config.urlStyle === "path",
      requestHandler: {
        handle: async (
          request: HttpRequest,
          options: HttpHandlerOptions = {},
        ) => {
          const url = new URL(
            request.protocol +
              "//" +
              request.hostname +
              (request.port ? ":" + request.port : "") +
              request.path,
          );
          for (const [key, value] of Object.entries(request.query ?? {})) {
            for (const item of Array.isArray(value) ? value : [value])
              url.searchParams.append(key, item ?? "");
          }
          const headers = new Headers(request.headers);
          headers.delete("host");
          const body =
            request.body instanceof Uint8Array
              ? new Blob([new Uint8Array(request.body)])
              : request.body;
          const response = await this.fetch(url, {
            method: request.method,
            headers,
            body,
            signal: options.abortSignal as AbortSignal | undefined,
          });
          return {
            response: {
              statusCode: response.status,
              headers: Object.fromEntries(response.headers),
              body: response.body ?? undefined,
            },
          };
        },
      },
    });
  }
  private key(name: string) {
    return this.config.pathPrefix
      ? this.config.pathPrefix.replaceAll(/\/$|^\//g, "") + "/" + name
      : name;
  }
  uploadFile(name: string, content: Uint8Array): Promise<boolean> {
    return this.put(name, content, false);
  }
  createFileIfAbsent(name: string, content: Uint8Array): Promise<boolean> {
    return this.put(name, content, true);
  }
  private async put(name: string, content: Uint8Array, createOnly: boolean) {
    let client: S3Client | undefined;
    try {
      client = this.client();
      await client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(name),
          Body: content,
          ...(createOnly ? { IfNoneMatch: "*" } : {}),
        }),
      );
      return true;
    } catch {
      // 沿用桌面返回false的控制流，发布者仍会读取后继记录确认结果。
      return false;
    } finally {
      client?.destroy();
    }
  }
  async downloadFile(name: string): Promise<Uint8Array> {
    const client = this.client();
    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(name),
        }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new Error("S3返回空响应体");
      return bytes;
    } finally {
      client.destroy();
    }
  }
  async fileExists(name: string): Promise<boolean> {
    const client = this.client();
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(name),
        }),
      );
      return true;
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return false;
      throw error;
    } finally {
      client.destroy();
    }
  }
  async listFiles(prefix?: string): Promise<RemoteFileInfo[]> {
    const base = this.config.pathPrefix
      ? this.config.pathPrefix.replaceAll(/\/$|^\//g, "")
      : "";
    const extra = prefix ? prefix.replace(/^\/+/, "").replace(/\/+$/, "") : "";
    const combined = [base, extra].filter(Boolean).join("/");
    let client: S3Client | undefined;
    const files: RemoteFileInfo[] = [];
    try {
      client = this.client();
      let cursor: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: combined
              ? combined.replace(/^\/+/, "").replace(/\/+/g, "/")
              : undefined,
            ContinuationToken: cursor,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (!item.Key || item.Key.endsWith("/")) continue;
          const normalized = item.Key.replace(/^\/+/, "");
          const root = base.replace(/\/+$/, "");
          const relative =
            root && normalized.startsWith(root + "/")
              ? normalized.slice(root.length + 1)
              : normalized === root
                ? ""
                : normalized;
          files.push({
            name: relative.split("/").filter(Boolean).pop() || relative,
            path: relative,
            size: Number(item.Size || 0),
            lastModified: item.LastModified?.getTime(),
          });
        }
        cursor = page.IsTruncated
          ? page.NextContinuationToken || undefined
          : undefined;
      } while (cursor);
      return files;
    } catch {
      // 旧桌面将列举失败转为空列表，本次不混入错误策略调整。
      return [];
    } finally {
      client?.destroy();
    }
  }
}

export function createS3SyncProvider(
  config: unknown,
  fetch: typeof globalThis.fetch,
) {
  return new S3SyncProvider(parse(config), fetch);
}
