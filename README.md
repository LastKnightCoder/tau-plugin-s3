# Tau S3 同步存储插件（开发中）

当前实现最小Node同步提供方：uploadFile、downloadFile、fileExists、listFiles、createFileIfAbsent。首轮按旧桌面S3迁移：上传/列举走签名SDK，下载/存在查询沿用拼URL后GET/HEAD的行为。旧CLI使用签名读取，这是单独记录的差异，尚未切换CLI到本插件；不能宣称已完成私有桶读取方式统一。

使用pnpm管理。SDK同步入口尚未发布，开发阶段通过相邻editor工作区链接同一份契约，不复制类型。运行pnpm check、pnpm test、pnpm build:backend。SDK版本对齐旧桌面与CLI的3.948.0，不额外设置重试或校验和策略。当前尚未形成可安装完整插件，配置界面、打包集成和完整客户端验收仍待完成，不能用于生产同步。

凭据属于运行配置，不放入源码或测试夹具。真实验收仅使用随机隔离前缀。条件写入保留旧桌面的IfNoneMatch请求及false返回控制流；提交确认由客户端完成，不通过先查询再覆盖模拟，不增加能力声明或安装前的服务商探测。现有条件写入兼容性问题与插件迁移分开处理。
