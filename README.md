<p align="center">
  <img src="logo.png" alt="定制地图 / Yunshang Map" width="420">
</p>

# 定制地图 · Yunshang Map

> 从 [dscao/gaode_maps](https://github.com/dscao/gaode_maps) 分叉而来，集成域 `yunshang_map`，中文显示名统一为「定制地图」。

Home Assistant 自定义集成 + Lovelace 卡片：在 HA 中显示 `device_tracker` / `geo_location` 的位置、运动轨迹回放、回家路线与用时；支持高德、百度、OSM 底图，以及浅色 / 深色 / 跟随系统主题。

![浅色主题](docs/preview-light.jpg)

## 功能概览

- **侧边栏面板 + 卡片**：面板入口「定制地图」；卡片 `custom:yunshang-map` 支持可视化编辑与多设备。
- **设备图标**：优先使用实体图片 / 自定义 mdi 图标，否则按设备名称推断（汽车、自行车、飞机、宠物等）。
- **轨迹回放**：2 台以上设备同步回放，支持播放 / 暂停 / 停止、倍速、拖动定位；回放范围可在「滑动条」和「日期」两种方式间切换。
- **回家路线**：驾车 / 骑行 / 步行，并计算回家用时（需要配置高德 Key + jscode）。
- **多底图**：高德地图 / 卫星、百度地图 / 卫星、OSM，面板底部一键切换；路况、家的位置与范围、设备列表均可开关。
- **主题**：浅色 / 深色 / 跟随系统，设置会记住，并同步到内嵌卡片。
- **移动端**：底部抽屉可拖动，横屏 / 折叠屏自动切换侧边布局。

![深色主题](docs/preview-dark.jpg)

## 安装

1. 将仓库中的 `custom_components/yunshang_map` 整个目录放到 Home Assistant 的 `config/custom_components/` 下。
2. 重启 Home Assistant。
3. 打开「设置 → 设备与服务 → 添加集成」，搜索「定制地图」并完成配置。

HACS 用户可将本仓库添加为「集成」类型的自定义存储库后安装。更多安装细节见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。

## 配置

集成配置项全部是**可选**的，只显示位置和轨迹时不需要填任何 Key：

| 配置项 | 说明 |
| --- | --- |
| 高德地图 Web 端 Key | 仅「回家路线 / 地址反查」需要，按需加载，不影响底图与轨迹回放 |
| 高德安全密钥 jscode | 2021-12 之后申请的 Key 需要；留空时回家路线按钮会置灰并提示 |
| Home Assistant 长期访问令牌 | 通常无需填写；内嵌在 HA 中会自动复用当前登录会话，仅独立浏览器打开地图页时需要 |
| 追踪设备 | 在「选项」中选择要显示的 `device_tracker`；不选则显示全部 |
| 可用底图类型 | 在「选项」中勾选允许使用的底图，默认全选 |

Lovelace 卡片 YAML 示例：

```yaml
type: custom:yunshang-map
entities:
  - device_tracker.tesla_location
  - device_tracker.es6_location
hours_to_show: 24
default_zoom: 14
map_type: amap
theme_mode: auto
aspect_ratio: 16:9
```

完整配置项（集成选项、卡片选项、可视化编辑器、设备头像/图标配置）见 **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**。

## 使用

- **面板**：侧边栏点击「定制地图」；底部按钮：路况、家的位置、家的范围、设备列表、主题。
- **轨迹回放**：「轨迹回放」页签选择设备 → 选回放范围（滑动条或日期）→「显示运动轨迹」→ 播放/暂停/停止、倍速、拖动定位。
- **回家路线**：「回家路线」页签勾选设备 →「显示回家路线」，可切换驾车/骑行/步行。
- **设备详情**：点击地图图标，或双击设备列表中的设备。
- **卡片**：编辑仪表盘添加「定制地图」卡片，可直接可视化配置实体、缩放、底图、主题等。

![面板与轨迹回放](docs/preview-panel.jpg)

## 常见问题

- 卡片一直显示加载中？→ 升级到 v1.10+，并强制刷新浏览器缓存。
- 长期令牌是否必须？→ 不是，内嵌在 HA 中不需要；独立打开地图页才需要。
- 回家路线 / 地址反查不可用？→ 检查高德 Key 与 jscode 是否都已填写。
- OSM 显示 blocked / 空白？→ 已改用 OSM France 瓦片；仍不可用时可在「选项 → 可用底图类型」中取消 OSM。
- 轨迹回放时设备图标不见了？→ 这是有意设计：回放时只显示历史轨迹中的移动图标，隐藏实时位置。

更多问题见 **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 完整版本历史 |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | 集成选项、卡片选项、主题、图标配置 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 前端/后端结构、数据流、坐标系与关键实现 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | 常见问题与排查 |
| [docs/UPGRADE.md](docs/UPGRADE.md) | 从 `gaode_maps` 升级、版本升级与配置兼容 |
| [AGENTS.md](AGENTS.md) | 给 AI/开发者的仓库约定、开发与发布流程 |

## 致谢

- [dscao/gaode_maps](https://github.com/dscao/gaode_maps)：本项目的直接上游
- [cxlwill/ha-inkwavemap](https://github.com/cxlwill/ha-inkwavemap)、[shaonianzhentan/google_maps](https://github.com/shaonianzhentan/google_maps)：早期参考实现
- [高德开放平台](https://lbs.amap.com/)：地图服务
- [Leaflet](https://leafletjs.com/) / [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) / [proj4js](https://github.com/proj4js/proj4js) / [Proj4Leaflet](https://github.com/kartena/Proj4Leaflet)：地图渲染
- [Material Design Icons](https://pictogrammers.com/)：设备图标

## 许可

本项目沿用上游的 [GNU General Public License v3.0](LICENSE)。
