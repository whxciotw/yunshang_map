# 配置说明

本文档覆盖安装、集成配置、Lovelace 卡片配置、主题、底图与设备图标。快速开始请看 [README](../README.md)。

## 安装

### 手动安装

1. 下载本仓库（`main` 分支 zip 或 `git clone`）。
2. 将 `custom_components/yunshang_map` 整个目录复制到 Home Assistant 的 `config/custom_components/` 下。
3. 重启 Home Assistant。
4. 「设置 → 设备与服务 → 添加集成」，搜索「定制地图」并完成配置。

### HACS 自定义存储库

HACS → 集成 → 右上角菜单 → 自定义存储库，填入 `https://github.com/whxciotw/yunshang_map`，类型选择「集成」，下载安装后重启 Home Assistant。

## 集成配置项

添加集成时只需填「高德 Key / jscode / 长期令牌」（均可留空）；「追踪设备」「可用底图类型」在添加完成后的「设置 → 设备与服务 → 定制地图 → 配置」中设置：

| 配置项 | 必填 | 说明 |
| --- | --- | --- |
| 高德地图 Web 端 Key | 否 | 在 [高德开放平台](https://console.amap.com/dev/key/app) 申请。仅「回家路线 / 地址反查」需要，前端按需加载高德 JS API；不影响任何底图与轨迹回放。 |
| 高德安全密钥 jscode | 否 | 2021-12 之后申请的 Key 需要同时配置。留空时「回家路线」按钮置灰、地址反查显示不可用提示。 |
| Home Assistant 长期访问令牌 | 否 | 内嵌在 HA 面板/卡片中显示时会自动复用当前登录会话（WebSocket），通常无需填写；只有把地图页面当独立网页直接打开时才需要。 |
| 追踪设备 | 否 | 在「选项」中选择需要显示的 `device_tracker`；不选择则显示全部。 |
| 可用底图类型 | 否 | 在「选项」中勾选允许展示的底图，**默认全选**。未勾选的底图不会出现在面板和卡片的下拉列表中。 |

> 说明：追踪设备只针对 `device_tracker` 类型实体；`geo_location` 主要给卡片使用（见下文）。「追踪设备」「可用底图类型」属于集成选项，不在首次添加向导中。

### 长期令牌说明

- 面板与卡片 iframe 与 HA 同源，会读取父页面的 `hass` 对象，通过 WebSocket 调用 `get_states` / `get_config` / `history/history_during_period`，因此**不需要长期令牌**。
- v1.15.1 起面板 iframe 的 URL **不再携带长期令牌**；令牌只会通过 WebSocket 返回给**管理员**会话（用于卡片 iframe 的独立浏览器兜底），非管理员用户拿不到。
- 只有直接用浏览器打开 `/yunshang_map_www/index.html`（脱离 HA 页面、且浏览器中没有 HA 登录态）时，才需要令牌；可手动在 URL 上追加 `?hasstoken=...`。
- 如果长期令牌已经失效，建议在集成配置中清空，不影响内嵌地图。

### 高德 Key / jscode 说明

- 高德/百度/OSM 底图都是**栅格瓦片**，不需要 Key。
- 「回家路线 / 回家用时 / 地址反查」需要高德 JS API，因此需要 Key；新申请的 Key 还需要安全密钥 jscode。
- 未配置或配置不全时，前端会置灰相关按钮并显示原因，不会出现“点了没反应”。
- 旧版 Key（2021-12 之前申请）可能不需要 jscode，可只填 Key 试试。

## Lovelace 卡片配置

在仪表盘「添加卡片 → 按卡片（手动）→ 定制地图」即可使用可视化编辑器；也支持 YAML。

| 配置项 | 说明 | 默认 |
| --- | --- | --- |
| `entities` | 设备实体列表（可多选，兼容旧 `entity_id`） | 必填 |
| `geo_location_sources` | `geo_location` 实体的来源（source），多个用逗号分隔；`all` 表示全部 | 空 |
| `hours_to_show` | 显示过去几小时的多设备历史轨迹；0 表示不显示 | 24 |
| `default_zoom` | 打开时的缩放级别（3-18） | 14 |
| `map_type` | 底图：`amap` / `amap-satellite` / `baidu` / `baidu-satellite` / `osm` | `amap` |
| `theme_mode` | 主题：`auto`（跟随 HA）/ `light` / `dark` | `auto` |
| `aspect_ratio` | 卡片宽高比，如 `16:9`、`4:3`；留空则按布局自适应 | 空 |

```yaml
type: custom:yunshang-map
entities:
  - device_tracker.car
  - device_tracker.bike
hours_to_show: 24
default_zoom: 14
map_type: amap
theme_mode: auto
aspect_ratio: 16:9
```

说明：

- 多设备时自动适配视野；卡片底部「设备列表」按钮可打开设备列表 / 轨迹回放 / 回家路线。
- 分区（sections）布局下卡片会铺满所占区域；masonry 布局默认 16:9，可用 `aspect_ratio` 调整。
- 拖动改变卡片大小时地图会自动调整尺寸。
- 卡片底图下拉与编辑器选项会按集成选项中的「可用底图类型」过滤。

## 主题

- 支持「浅色 / 深色 / 跟随系统」三种模式。
- 面板底部主题按钮可一键切换，选择会记在浏览器本地；`theme_mode` 控制卡片的初始主题。
- 深色主题下地图瓦片会自动做暗色滤镜，设备列表、轨迹面板、按钮均适配。

## 底图与路况

| 底图 | 说明 |
| --- | --- |
| 高德地图 / 高德卫星 | 高德栅格瓦片（GCJ02），无需 JS API；只有回家路线/地址反查时按需加载高德 JS API |
| 百度地图 / 百度卫星 | 百度栅格瓦片（BD09），使用 proj4leaflet 自定义 CRS 纠正投影 |
| OSM 地图 | OpenStreetMap France HOT 瓦片（WGS84，全球可用，带 OSM 版权标注）；`map_type` 仍为 `osm` |
| 路况 | 面板底部「路况」按钮开关，高德/百度瓦片对应各自的路况图层 |

地图渲染使用项目内置的 Leaflet 1.9.4、Leaflet.markercluster、proj4js / proj4leaflet，不依赖外部 CDN。

## 设备图标 / 用户头像

地图标记的图标优先级：

```
entity_picture（图片） > 实体自定义 icon（mdi 图标） > 按设备名称推断 > 默认图标
```

不需要改插件代码，直接在 Home Assistant 中配置：

1. **用户头像**：「设置 → 人员」为成员上传/更换头像，`person.*` 实体的 `entity_picture` 即为该头像。
2. **给 device_tracker 指定头像**：在 `customize.yaml` 中为对应实体补充 `entity_picture`，地址可取对应 person 实体的 `entity_picture`：

   ```yaml
   device_tracker.hostname0:
     entity_picture: /api/image/serve/<图片ID>/512x512
   ```

   修改后「开发者工具 → YAML → 重新加载核心配置」或重启 HA。
3. **只想用图标**：「设置 → 设备与服务 → 实体」中选择该 `device_tracker`，点齿轮修改图标（如 `mdi:car`、`mdi:cellphone`），插件会读取实体 `icon`。
4. `/api/image/serve/...` 的图片 ID 与人员头像绑定，更换头像后需同步更新；也可以把头像放到 `config/www/` 下用 `/local/xxx.png` 引用，更稳定。

## 收起设备列表

- 面板标题栏右侧有一个下箭头按钮：点击收起设备列表，只保留页签、回放范围、播放/停止、回家路线按钮和拖拽条，尽量不遮挡地图。
- 再次点击（变为上箭头）即可展开；面板关闭后重新打开会自动恢复展开状态。
- 收起状态下仍可正常播放/暂停轨迹、拖动轨迹位置、显示/隐藏回家路线。

## 数据源与刷新

- 内嵌在 HA 中：优先 WebSocket（`get_states`、`get_config`、`history/history_during_period`），实时、无需令牌。
- 独立打开页面：回退 REST API（`/api/states`、`/api/history/period`），需要长期令牌。
- 设备状态默认每 10 秒左右刷新；卡片历史轨迹每 60 秒刷新一次。
- 轨迹回放的时间范围会保存在浏览器本地（滑动条 / 日期模式分别记忆）。
