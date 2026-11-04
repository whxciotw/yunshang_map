# 架构说明

本文档描述「定制地图」的整体结构、数据流与关键实现，方便二次开发或排查问题。开发/发布约定见 [AGENTS.md](../AGENTS.md)。

## 组成

```
Home Assistant
├── custom_components/yunshang_map/          # 自定义集成
│   ├── __init__.py                         # 注册侧边栏面板、静态目录、WebSocket 命令
│   ├── config_flow.py                      # 集成配置 / 选项
│   ├── manifest.json / manifest.py         # 集成元数据与版本读取
│   ├── translations/                       # 中英文翻译
│   └── www/                                # 前端静态资源（面板与卡片共用）
│       ├── index.html                      # 地图页面
│       ├── index.js                        # 面板逻辑（列表、轨迹、路线、拖拽）
│       ├── map.js                          # Lovelace 卡片 + 可视化编辑器（LitElement）
│       ├── config.js / utils.js / language.js
│       ├── theme.js / uiicons.js / dock.js
│       ├── deviceicons.js / entityutils.js
│       ├── js/geo.js                       # 坐标系转换、距离
│       ├── js/mapleaflet.js                # Leaflet 地图引擎/底图/轨迹/路线/反查
│       ├── js/map.js                       # 地图控制器封装
│       ├── css/map.css                     # 面板、列表、轨迹、移动端样式
│       ├── leaflet/                        # 内置 Leaflet、markercluster、proj4
│       └── images/                         # 页面图片资源
└── 仓库根目录
    ├── README.md / CHANGELOG.md / AGENTS.md
    ├── docs/                               # 配置、架构、排障、升级、预览图
    └── hacs.json / LICENSE / logo.png ...
```

> 注意：`www/map.js` 是卡片入口，`www/js/map.js` 是地图控制器，两者不是同一个文件。

## 两种使用形态

1. **侧边栏面板**：HA 注册 iframe 面板，URL 指向 `/yunshang_map_www/index.html`，带上集成配置（令牌、Key、jscode、追踪设备、可用底图、版本号）。
2. **Lovelace 卡片**：`custom:yunshang-map`（`www/map.js`，LitElement）。卡片渲染一个 iframe，URL 参数与面板类似；通过 WebSocket 命令 `yunshang_map` 获取令牌/Key/可用底图，再生成 iframe。

两种形态共用同一个 `index.html`，通过 `embed=1` 区分内嵌模式。

## 数据流

```
HA 状态/历史（WebSocket 或 REST）
        │
        ▼
www/index.js  ──► deviceStore / trackSelected / 状态列表
        │
        ├──► Leaflet 地图（www/js/mapleaflet.js）
        │       ├── 底图瓦片（高德/百度/OSM）
        │       ├── 设备标记、精度圈、区域、轨迹线、路线
        │       └── 轨迹动画（rAF + 时间轴进度）
        │
        └──► 面板 UI（设备列表 / 轨迹回放 / 回家路线）
```

- **内嵌模式**：读取同源父页面 `hass`，用 `hass.connection` 发 WebSocket 命令：
  - `get_states`、`get_config`（设备与家）
  - `history/history_during_period`（历史轨迹）
- **独立模式**：没有父页面 `hass` 时回退 `fetch` REST API，需要长期令牌。
- 设备状态约每 10 秒刷新；卡片历史轨迹每约 60 秒刷新。

## 坐标系

- 内部数据统一为 **WGS84**（HA 的 device_tracker 坐标）。
- 渲染时按底图转换：
  - 高德瓦片 → GCJ02（`wgs84ToGcj02`）
  - 百度瓦片 → BD09（`wgs84ToBd09`，百度使用 proj4leaflet 自定义 CRS）
  - OSM 瓦片 → WGS84（恒等）
- **切换底图时必须用旧底图坐标系保存视野中心**，再按新底图投影。否则会出现几百米整体漂移（v1.11 修复）。
- 不同坐标系之间本身存在几百米视觉差异属正常现象；同一底图内设备与瓦片是对齐的。
- 百度瓦片的缩放分辨率与高德/OSM 不同，同一 zoom 数字下显示比例略有差异。

## 关键实现

### 底图

- `www/js/mapleaflet.js` 中的 `LEAFLET_BASEMAPS` 定义底图（URL、CRS、缩放范围、版权）。
- 允许列表来自集成选项 `maptypes`，通过 `MapTypesAllowed` 注入前端；`ysBasemapOptions()` 与 `setBasemap()` 都会校验。
- 高德/百度路况是独立的瓦片图层，由底部「路况」按钮开关，不属于底图选项。

### 轨迹回放

- 轨迹数据按实体查询历史，生成每条轨迹的 `path`、累计距离/时间（`timeCum`）。
- 动画用 `requestAnimationFrame` 自适应时长（约 5–20 秒），支持 0.5×–8× 倍速。
- 进度按**时间轴**而不是点数计算，设备长时间静止时位置/地址也正确。
- 拖动 seek 用二分查找定位时间点。
- `trackSelectedOrder` 是选择状态的唯一准绳；回放时隐藏实时设备标记，只显示轨迹移动图标。
- 回放范围支持「滑动条」与「日期」两种模式，均持久化在本地。

### 回家路线 / 地址反查

- 需要高德 Key + jscode 时，按需加载高德 JS API（`AMap.Driving/Walking/Riding`、`AMap.Geocoder`）。
- 未配置时前端统一置灰并提示，驱动层也做保护，不发起无效请求。
- 地址反查有 260ms 防抖和本地缓存。

### 移动端与主题

- 移动端为底部抽屉，可拖动；吸附 45% / 68% / 90%，向下拖过 30% 关闭。
- 标题栏可收起设备列表：收起后隐藏列表/范围/速度等次要内容，保留页签、轨迹/路线主按钮、播放与位置拖动，减少地图遮挡。
- 横屏/折叠屏（高度 ≤520 且宽度 ≥600）使用侧边布局。
- 轨迹加载后按宽度进入三级紧凑模式。
- 主题：浅色 / 深色 / 跟随系统；深色下对瓦片加暗色滤镜。
- 安全区适配、列表独立滚动。

## 与 [ryanh7/map-card](https://github.com/ryanh7/map-card) 的功能对照

| 能力 | 说明 | 状态 |
| --- | --- | --- |
| GPS 精度圈 | 按 `gps_accuracy` 画精度范围 | ✅ |
| 自动适配视野 / 聚焦 | 适配全部设备或全部轨迹 | ✅ |
| 多实体显示 | `entities` 数组、每实体颜色 | ✅ |
| 可视化编辑器 | 实体多选、缩放、底图、主题等 | ✅ |
| 多底图 | 高德/百度/OSM + 自定义 CRS | ✅ 5 种 |
| 多设备历史轨迹同屏 | 不同颜色、时间轴 | ✅ |
| `hours_to_show` 历史轨迹 | 历史数据 + tooltip 时间 | ✅ |
| 历史数据获取 | WebSocket，无需令牌 | ✅ 内嵌模式 |
| `aspect_ratio` / `geo_location_sources` | 卡片布局与数据源 | ✅ |

## 二次开发入口

- 新增/修改前端功能：优先看 `www/js/mapleaflet.js`（地图）与 `www/index.js`（面板逻辑）。
- 修改卡片或编辑器：`www/map.js`。
- 修改集成配置：`config_flow.py`、`__init__.py`、`translations/*.json`。
- 新增底图：`LEAFLET_BASEMAPS` + `www/map.js` 的 `MAP_TYPES` + `config_flow.py` 的 `MAP_TYPE_OPTIONS`。
- 版本升级与发布流程：见 [AGENTS.md](../AGENTS.md)。
