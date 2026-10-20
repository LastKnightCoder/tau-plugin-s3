import { useState } from "react";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { Button, Input, Select, SettingRow } from "@tau/ui";
import { createS3SyncProvider } from "./sync";

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

  const handleSave = async () => {
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
  };

  return (
    <>
      <SettingRow title="Endpoint" description="可选，自定义 S3 服务地址">
        <Input
          className="w-[260px]"
          aria-label="Endpoint"
          type="text"
          value={config.endpoint}
          placeholder="https://s3.example.com"
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, endpoint: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="Bucket" description="同步存储桶名称">
        <Input
          className="w-[260px]"
          aria-label="Bucket"
          type="text"
          value={config.bucket}
          placeholder="同步存储桶"
          required
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, bucket: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="Region" description="存储区域">
        <Input
          className="w-[260px]"
          aria-label="Region"
          type="text"
          value={config.region}
          placeholder="us-east-1"
          required
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, region: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="路径前缀" description="可选">
        <Input
          className="w-[260px]"
          aria-label="路径前缀"
          type="text"
          value={config.pathPrefix}
          placeholder=""
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, pathPrefix: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="Access Key ID">
        <Input
          className="w-[260px]"
          aria-label="Access Key ID"
          type="text"
          value={config.accessKeyId}
          placeholder=""
          required
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, accessKeyId: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="Secret Access Key">
        <Input
          className="w-[260px]"
          aria-label="Secret Access Key"
          type="password"
          value={config.secretAccessKey}
          placeholder=""
          required
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setSaved(false);
            setConfig({ ...config, secretAccessKey: event.target.value });
          }}
        />
      </SettingRow>

      <SettingRow title="地址模式">
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
      </SettingRow>

      {error && (
        <SettingRow title="">
          <p role="alert" className="text-danger text-tau-body">
            {error}
          </p>
        </SettingRow>
      )}
      {saved && (
        <SettingRow title="">
          <p role="status" className="text-ink-2 text-tau-body">
            配置已保存，可以使用客户端的检查、上传和下载。
          </p>
        </SettingRow>
      )}

      <SettingRow title="">
        <Button onClick={handleSave} loading={saving} loadingText="保存中…">
          保存同步配置
        </Button>
      </SettingRow>
    </>
  );
}
export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.sync.register({
        id: context.pluginId,
        name: "S3",
        create: (config) => createS3SyncProvider(config, context.fetch),
      });
      context.settings.register({
        id: "sync",
        title: "S3 同步存储",
        target: "sync",
        component: S3Settings,
      });
    },
  }),
});
