import { definePlugin, type ProviderForm } from "@tau/plugins";
import { createS3SyncProvider } from "./sync";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

const form: ProviderForm = {
  groups: [
    {
      title: "账号",
      fields: [
        { key: "accessKeyId", label: "Access Key ID", type: "text" },
        { key: "secretAccessKey", label: "Secret Access Key", type: "secret" },
      ],
    },
    {
      title: "存储位置",
      fields: [
        { key: "bucket", label: "Bucket", type: "text", summary: true },
        { key: "region", label: "区域", type: "text", placeholder: "us-east-1", summary: true },
        {
          key: "endpoint",
          label: "服务地址",
          type: "url",
          optional: true,
          description: "兼容 S3 的服务（R2、MinIO 等）填写",
          placeholder: "https://s3.example.com",
        },
        { key: "pathPrefix", label: "目录", type: "text", optional: true, placeholder: "sync" },
        {
          key: "urlStyle",
          label: "地址模式",
          type: "choice",
          default: "path",
          options: [
            { value: "path", label: "路径模式", description: "地址形如 endpoint/bucket/对象，兼容性最好" },
            { value: "virtualHosted", label: "虚拟主机模式", description: "地址形如 bucket.endpoint/对象" },
          ],
        },
      ],
    },
  ],
};

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.sync.register({
        id: context.pluginId,
        name: "S3",
        create: config => createS3SyncProvider(config, context.fetch),
      });
      context.settings.register({ id: "sync", title: "S3", target: "sync", form });
    },
  }),
});
