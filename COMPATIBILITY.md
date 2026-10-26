# 兼容性与开发验证

当前作者契约使用 SDK 0.46.0、UI 0.5.0，格式 3 的同一插件包声明桌面、Android 和 iOS。实际宿主必须同时满足清单版本与 fetch/sync/upload 功能要求；SDK、插件和客户端的发布分别进行，不从仓库源码推断线上已可安装。

桌面与移动使用同一 API、声明式 form 及存储业务实现。客户端在插件详情的设置中渲染字段，负责显式保存、连接测试与独立的服务选用。最低版本为桌面 0.60.2、Android / iOS 0.2.9。账号保存在对应领域的插件配置，不存主库 KV，也不与其他服务共享。

使用候选 SDK/UI 时，按统一模板的 use-local-sdk.mjs 在隔离作者目录注入 tarball；公开版本发布后使用 package.json 与 pnpm-lock.yaml 冻结安装。依次执行 pnpm test（若有）和 pnpm build，再验证真实宿主配置、网络、取消及重启。构建与单测不代替设备、最低系统和视觉验收。

作者 API 范围以[官方支持矩阵](https://github.com/LastKnightCoder/tau-plugin-template/blob/main/docs/api-support.md)为准。保持插件 ID，提高版本发行，不覆盖已发布的 ZIP。
