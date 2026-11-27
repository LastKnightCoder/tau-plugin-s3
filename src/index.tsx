import { messages } from "./i18n";
import { form } from "./form";
import { definePlugin } from "@tau/plugins";
import { createS3SyncProvider } from "./sync";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  i18n: messages,
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
