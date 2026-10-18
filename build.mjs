import { build } from "esbuild";
await build({
  entryPoints: ["src/sync.ts"],
  outfile: "dist/sync.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["@tau/plugins/sync"],
});
