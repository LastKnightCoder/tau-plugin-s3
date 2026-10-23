import type { PluginSettingsProps } from "@tau/plugins";
import { ConfigurationPanel, type ConfigurationField } from "@tau/ui";

const accountFields: readonly ConfigurationField[] = [
  {
    key: "accessKeyId",
    label: "Access Key ID",
  },
  {
    key: "secretAccessKey",
    label: "Secret Access Key",
    type: "password",
  },
  {
    key: "endpoint",
    label: "Endpoint",
    placeholder: "可选，自定义 S3 服务地址",
  },
  {
    key: "urlStyle",
    label: "地址模式",
    options: [
      {
        value: "path",
        label: "路径模式",
      },
      {
        value: "virtualHosted",
        label: "虚拟主机模式",
      },
    ],
  },
];
const fields: readonly ConfigurationField[] = [
  {
    key: "bucket",
    label: "Bucket",
    placeholder: "必填",
  },
  {
    key: "region",
    label: "Region",
    placeholder: "例如 ap-southeast-1",
  },
  {
    key: "pathPrefix",
    label: "目录",
    placeholder: "sync（可选）",
  },
];

export function MobileSettings(props: PluginSettingsProps) {
  const config = props.syncConfig ?? props.uploadConfig;
  if (!config) return <p>请从客户端对应的服务设置进入。</p>;
  const initialValue: Record<string, string> = { urlStyle: "path" };
  if (config.value && typeof config.value === "object" && !Array.isArray(config.value))
    for (const [key, value] of Object.entries(config.value))
      if (typeof value === "string") initialValue[key] = value;
  return (
    <ConfigurationPanel
      initialValue={initialValue}
      accountFields={accountFields}
      fields={fields}
      onSave={value =>
        config.save({
          ...(config.value && typeof config.value === "object" && !Array.isArray(config.value)
            ? config.value
            : {}),
          ...value,
        })
      }
    />
  );
}
