import { useState } from "react";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { Button, Input, Select } from "@tau/ui";

declare const __PLUGIN_META__: { id: string; name: string; version: string };
function S3Settings({ syncConfig }: PluginSettingsProps) {
  const value = syncConfig?.value;
  const fields =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const [config, setConfig] = useState(() => ({
    endpoint: String(fields.endpoint ?? ""),
    bucket: String(fields.bucket ?? ""),
    region: String(fields.region ?? ""),
    pathPrefix: String(fields.pathPrefix ?? ""),
    accessKeyId: String(fields.accessKeyId ?? ""),
    secretAccessKey: String(fields.secretAccessKey ?? ""),
    urlStyle: String(fields.urlStyle ?? "path"),
  }));
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  if (!syncConfig) return <p>请在客户端的同步设置中配置此插件。</p>;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError("");
        setSaved(false);
        try {
          await syncConfig.save(config);
          setSaved(true);
        } catch (issue) {
          setError(issue instanceof Error ? issue.message : "保存失败");
        } finally {
          setSaving(false);
        }
      }}
    >
      {(
        [
          ["endpoint", "Endpoint", "https://s3.example.com"],
          ["bucket", "Bucket", "同步存储桶"],
          ["region", "Region", "us-east-1"],
          ["pathPrefix", "路径前缀", "可选"],
          ["accessKeyId", "Access Key ID", ""],
          ["secretAccessKey", "Secret Access Key", ""],
        ] as const
      ).map(([key, label, placeholder]) => (
        <label key={key} className="flex flex-col gap-1">
          <span>{label}</span>
          <Input
            aria-label={label}
            type={key === "secretAccessKey" ? "password" : "text"}
            required={[
              "bucket",
              "region",
              "accessKeyId",
              "secretAccessKey",
            ].includes(key)}
            autoComplete="off"
            spellCheck={false}
            value={config[key]}
            placeholder={placeholder}
            disabled={saving}
            onChange={(event) => {
              setSaved(false);
              setConfig({ ...config, [key]: event.target.value });
            }}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span>地址模式</span>
        <Select
          aria-label="地址模式"
          value={config.urlStyle}
          disabled={saving}
          options={[
            { value: "path", label: "路径模式" },
            { value: "virtualHosted", label: "虚拟主机模式" },
          ]}
          onValueChange={(urlStyle) => {
            setSaved(false);
            setConfig({ ...config, urlStyle });
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {saved && (
        <p role="status">配置已保存，可以使用客户端的检查、上传和下载。</p>
      )}
      <div>
        <Button type="submit" loading={saving}>
          保存同步配置
        </Button>
      </div>
    </form>
  );
}
export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.settings.register({
        id: "sync",
        title: "S3 同步存储",
        target: "sync",
        component: S3Settings,
      });
    },
  }),
});
