# 开发与构建

需要Node.js 22及以上、pnpm 11.9.0。依赖全部来自公开npm，不需要Tau源码或本地SDK快照。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

产物为 `dist/tau.sync-s3-0.1.2.zip`。客户端安装验收请使用支持同步插件的Tau 0.59.0构建。单元测试仅访问本机测试服务，不读取真实凭据。

`src/index.tsx`提供配置表单，`src/sync.ts`实现五个存储方法。公开SDK通过npm别名安装为`@tau/plugins`、`@tau/ui`，必须保留构建脚本的external配置；运行时由Tau提供。普通npm依赖打包到产物。SDK同步契约和配置表单接口详见模板仓库的[SYNC.md](https://github.com/LastKnightCoder/tau-plugin-template/blob/main/SYNC.md)。

README面向用户并随ZIP分发。不要在源码、日志或测试夹具中放真实凭据。真实服务验证使用专用前缀；不通过查询后覆盖模拟条件创建，不在插件中实现版本和冲突引擎。
