# 开发与构建

当前依赖、平台边界与验证步骤见 [兼容性说明](COMPATIBILITY.md)。

## 自动发布

本仓库的.github/workflows/release.yml与公开模板一致。同步更新package.json和manifest.json版本并提交后，推送对应版本tag即可自动安装依赖、运行测试（若定义）、构建并将ZIP上传到GitHub Release，无需手动上传或配置额外Token。

```sh
version=$(node -p "require('./manifest.json').version")
git tag "v$version"
git push origin HEAD
git push origin "v$version"
```

tag也可不带v前缀，版本必须与两个文件一致；预发布版本自动标记为Pre-release。Actions失败可重跑，已有Release会更新同名ZIP。已发布版本不要移动tag，代码修复应提高版本再发布。仓库需启用Actions并允许contents:write。Git远程统一使用SSH；该流程不自动提交插件中心审核或更新客户端固定产物。

需要Node.js 22及以上、pnpm 11.9.0。依赖全部来自公开npm，不需要Tau源码或本地SDK快照。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

产物为 `dist/tau.sync-s3-0.2.0.zip`。需要SDK0.10.0和支持渲染端同步注册的Tau 0.59.0构建。单元测试仅访问本机测试服务，不读取真实凭据。

`src/index.tsx`在activate中注册配置表单和同步提供方，`src/sync.ts`是同一渲染入口导入的普通模块，实现五个存储方法。S3 SDK按浏览器目标打包，HTTP传输使用context.fetch；没有sync.js后台入口，不依赖Node Buffer或宿主node_modules。公开SDK通过npm别名安装为`@tau/plugins`、`@tau/ui`，必须保留构建脚本的external配置。接口详见模板仓库的[SYNC.md](https://github.com/LastKnightCoder/tau-plugin-template/blob/main/SYNC.md)。

README面向用户并随ZIP分发。不要在源码、日志或测试夹具中放真实凭据。真实服务验证使用专用前缀；不通过查询后覆盖模拟条件创建，不在插件中实现版本和冲突引擎。
