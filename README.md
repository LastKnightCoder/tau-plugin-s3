# Tau S3 同步存储插件（开发中）

当前实现最小Node同步提供方：uploadFile、downloadFile、fileExists、listFiles、createFileIfAbsent。首轮按旧桌面S3迁移：上传/列举走签名SDK，下载/存在查询沿用拼URL后GET/HEAD的行为。旧CLI使用签名读取，这是单独记录的差异，尚未切换CLI到本插件；不能宣称已完成私有桶读取方式统一。

使用pnpm管理。SDK同步入口尚未发布，开发阶段依赖相邻editor/output/c30-wiring-sdk中的SDK/UI打包快照，不复制类型；尚不能仅克隆本仓库便独立构建。运行pnpm check、pnpm test、pnpm build，生成dist/tau.sync-s3-0.1.0.zip。AWS SDK版本对齐旧桌面与CLI的3.948.0，不额外设置重试或校验和策略。

在匹配的开发客户端插件页安装ZIP、重启并启用，然后在“设置→同步→同步插件”选择S3并保存配置。配置组件使用settings.register的target: "sync"，通过syncConfig.value/save读写应用级配置；后台使用同一插件ID的sync入口，任务结束由宿主释放。停用保留配置，任务进行时不能卸载或停用。pnpm install:local也可将构建产物安装到约定目录，之后重启客户端。

完整ZIP、配置界面及真实Electron的安装/启用/配置落盘/上传下载/重启恢复已在隔离目录验证。尚未发布SDK或插件、未迁移CLI，也没有自动接管原S3配置；真实服务测试请使用独立测试库与远端前缀。不能把本地测试服务通过等同于所有S3服务兼容。

凭据属于运行配置，不放入源码或测试夹具。真实验收仅使用随机隔离前缀。条件写入保留旧桌面的IfNoneMatch请求及false返回控制流；提交确认由客户端完成，不通过先查询再覆盖模拟，不增加能力声明或安装前的服务商探测。现有条件写入兼容性问题与插件迁移分开处理。
