import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  defineSyncProvider,
  type SyncProvider,
  type RemoteFileInfo,
} from "@tau/plugins/sync";

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

/** 首轮迁移对齐旧桌面S3；CLI的签名读取差异另行处理。 */
export class S3SyncProvider implements SyncProvider {
  constructor(private readonly config: Config) {}
  private client() {
    return new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      forcePathStyle: this.config.urlStyle === "path",
    });
  }
  private key(name: string) {
    return this.config.pathPrefix
      ? this.config.pathPrefix.replaceAll(/\/$|^\//g, "") + "/" + name
      : name;
  }
  private url(name: string) {
    const key = this.key(name);
    const endpoint =
      this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;
    if (this.config.urlStyle === "virtualHosted") {
      if (this.config.endpoint) {
        const url = new URL(this.config.endpoint);
        return `${url.protocol}//${this.config.bucket}.${url.host}/${key}`;
      }
      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
    }
    return (
      endpoint.replaceAll(/\/$|^\//g, "") + "/" + this.config.bucket + "/" + key
    );
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
          Body: Buffer.from(content),
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
    const response = await fetch(this.url(name));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  async fileExists(name: string): Promise<boolean> {
    const response = await fetch(this.url(name), { method: "HEAD" });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`S3 对象检查失败：${response.status}`);
    return true;
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

export default defineSyncProvider({
  id: "tau.sync-s3",
  name: "S3",
  create: (config) => new S3SyncProvider(parse(config)),
});
