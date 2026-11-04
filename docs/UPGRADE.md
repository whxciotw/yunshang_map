# 升级指南

## 从「墨澜地图（gaode_maps）」迁移

本集成使用新的集成域 `yunshang_map`，与旧版 `gaode_maps` 可以并存，但需要重新添加集成：

1. （可选）删除旧的 `custom_components/gaode_maps` 目录，避免重复。
2. 安装 `custom_components/yunshang_map` 并重启 Home Assistant。
3. 「设置 → 设备与服务 → 添加集成 → 定制地图」，按需填高德 Key / jscode / 长期令牌（都可留空）。
4. 仪表盘中的旧卡片不会自动迁移：把旧卡片替换为 `custom:yunshang-map`（或者编辑旧卡片的 `type`）。
5. 侧边栏会出现新的「定制地图」入口。

## 从旧版本 `yunshang_map` 升级

常规升级（HACS 或手动替换目录）后重启 HA 即可，一般不需要删除/重新添加集成。

升级后建议：

1. 强制刷新浏览器缓存（手机端清除站点数据），避免旧前端资源缓存。
2. 检查「选项」中的「可用底图类型」是否符合预期（默认全选）。
3. 如果之前配置的长期令牌已失效，可以清空，不影响内嵌显示。

### 配置兼容说明

| 旧配置 | 现在行为 |
| --- | --- |
| `map_type: amap-traffic` / `baidu-traffic` | 这两个底图已移除；会回退到 `amap`，路况改用底部「路况」按钮 |
| 卡片 `zoom` | 仍兼容，等价于 `default_zoom` |
| 卡片 `entity_id`（单个） | 仍兼容，内部转成 `entities` |
| 旧的长期令牌 | 可选；内嵌模式不再依赖 |
| 旧版 `osm` 底图 | `map_type` 不变，瓦片源已改为 OSM France HOT |
| 未配置 jscode | 回家路线/地址反查置灰；配置后自动可用 |
| 旧版本地缓存的选择/主题 | 会尽量保留；如异常，清除浏览器站点数据重新选择 |

### 版本升级时的静态资源缓存

前端引用带版本号（`?v=<版本>`）。升级后如果界面还是旧样式：

1. 确认 `manifest.json`、`www/index.html`、`www/map.js` 中的版本号一致（维护者）。
2. 强制刷新页面；HA App 可尝试「设置 → 清除缓存/重启应用」。

## 回滚

1. 恢复旧版 `custom_components/yunshang_map` 目录。
2. 重启 HA。
3. 强制刷新浏览器。

如果旧版本依赖已失效的长期令牌，重新填写或清空即可。

## 维护者发布步骤

见 [AGENTS.md](../AGENTS.md) 的「发布流程」。
