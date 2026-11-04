# AGENTS.md

> 给 AI 编码助手 / 维护者的仓库说明：结构、约定、常见任务与发布流程。
> 人类用户请先看 [README](README.md)；功能细节见 [docs/](docs/)。

## 项目定位

- Home Assistant 自定义集成 + Lovelace 卡片，集成域 `yunshang_map`，中文显示名「定制地图」。
- 侧边栏 iframe 面板与卡片共用同一套前端页面（`custom_components/yunshang_map/www/`）。
- 地图引擎：内置 Leaflet 1.9.4（栅格瓦片）+ markercluster + proj4/proj4leaflet；高德 JS API 仅在回家路线/地址反查时按需加载。
- 数据：内嵌时复用父页面 `hass` 的 WebSocket；独立打开时回退 REST + 长期令牌（可选）。

## 仓库结构

```
custom_components/yunshang_map/
├── __init__.py            # 面板注册、静态目录、extra_js、WebSocket 命令
├── config_flow.py         # 集成配置 + 选项（Key/jscode/longtoken/trackerids/maptypes）
├── manifest.json          # 版本号、domain、documentation
├── manifest.py            # 读取 manifest 的辅助类
├── translations/          # zh-Hans / en
└── www/
    ├── index.html         # 地图页面（面板和卡片共用）
    ├── index.js           # 面板逻辑：数据、列表、轨迹、路线、拖拽
    ├── map.js             # Lovelace 卡片 + 可视化编辑器（LitElement）
    ├── config.js          # 运行时配置（URL 参数）
    ├── theme.js           # 主题
    ├── js/geo.js          # 坐标系/距离
    ├── js/mapleaflet.js   # 地图引擎（底图、标记、轨迹动画、路线、反查）
    ├── js/map.js          # 地图控制器封装
    ├── css/map.css        # 面板/列表/轨迹/移动端样式
    └── leaflet/           # 内置第三方库（不要改成 CDN）
docs/                      # 配置、架构、排障、升级、预览图
CHANGELOG.md               # 版本历史（README 不再放 changelog）
```

## 必须遵守的约定

1. **界面文案用中文**，显示名统一「定制地图」；英文翻译同步更新 `translations/en.json`。
2. **不引入外部 CDN**。Leaflet 等库已在 `www/leaflet/`，高德 JS API 是唯一按需远程加载的脚本。
3. **保持兼容**：
   - `map_type` 的 `osm` 标识不要改（旧配置依赖）；底图显示名可以改。
   - 卡片旧参数 `entity_id`、`zoom` 仍要兼容。
   - 集成配置项全部可选，不能因为缺 Key/jscode 导致页面崩溃。
4. **版本号三处一致**（发布时）：
   - `custom_components/yunshang_map/manifest.json` 的 `version`
   - `www/index.html` 中所有 `?v=...`
   - `www/map.js` 的 `CARD_VERSION`
5. **不要提交敏感信息**：令牌、高德 Key、jscode、HA 地址/密码、Gitea token 等一律不要写进仓库或文档示例里（用占位符）。
6. 前端脚本保持现有风格（ES5 语法、jQuery/原生 DOM 混用），与 `index.js` / `mapleaflet.js` 保持一致，不要贸然引入构建工具。

## 关键不变量（改代码前先读）

- **iframe / 卡片**：面板 URL 由 `__init__.py` 生成；卡片在 `www/map.js` 里通过 WebSocket `yunshang_map` 拿配置并生成 iframe URL。卡片渲染条件不能要求 `hasstoken` 非空（v1.10 修复过一直加载中的 bug）。
- **坐标系**：内部统一 WGS84；高德 GCJ02、百度 BD09（proj4leaflet 自定义 CRS）、OSM 恒等。**切换底图时先用旧底图 CRS 保存中心**，再切新底图（v1.11 修复过 500 米漂移）。
- **轨迹选择**：`trackSelectedOrder` 是唯一准绳；不要只改 `trackSelected`。回放时隐藏实时设备标记，隐藏轨迹后恢复用户自己的隐藏设置。
- **轨迹动画**：按时间轴（`timeCum`）计算进度，seek 用二分查找；不要退回按点数推进。
- **OSM**：官方 `tile.openstreetmap.org` 对嵌入应用会 403，使用 OSM France HOT；不要改回官方瓦片。
- **底图可用列表**：集成选项 `maptypes` → 面板 URL / 卡片 iframe 参数 `maptypes` → `MapTypesAllowed` → `ysBasemapOptions()` / `setBasemap()` 过滤。新增底图要同时改三处（见下）。
- **手机布局**：底部抽屉可拖动、三级紧凑模式、横屏/折叠屏侧边布局；改动 CSS 时检查小屏不遮挡。
- **高德服务**：仅在 Key + jscode 都存在时启用；未配置时按钮置灰并提示，驱动层也要有保护。

## 常见任务

### 新增底图

1. `www/js/mapleaflet.js`：在 `LEAFLET_BASEMAPS` 增加定义（url/crs/zoom/attribution）。
2. `www/map.js`：在 `MAP_TYPES` 增加选项 label。
3. `config_flow.py`：在 `MAP_TYPE_OPTIONS` / `ALL_MAP_TYPES` 增加 value。
4. `translations/*.json`：如新增选项文案需要，补充对应翻译。
5. 测试：面板下拉、卡片编辑器、`maptypes` 过滤、切换返回旧配置兼容。

### 修改轨迹/回放

- 面板逻辑在 `www/index.js`（选择、时间范围、按钮、提示）。
- 动画/绘制在 `www/js/mapleaflet.js`（`queryMulti`、`_applyTrackProgress`、`seek`、`_trackFrame`）。
- 改完至少验证：单/多设备、暂停/继续/停止、拖动 seek、隐藏轨迹、日期模式、移动端布局。

### 修改集成配置

- `config_flow.py` + `translations/zh-Hans.json` / `en.json` + `__init__.py`（若需要传给前端）。
- 新配置要通过 URL 参数或 WebSocket 响应传到 `www/config.js`。
- 改完确认：全新安装、已有实例升级、配置为空/缺省都不报错。

## 测试

没有自动化测试套件；改动后按下面清单手测（建议用真实 HA + 一个 mock 页面）：

1. 侧边栏面板打开、设备列表、主题切换、底图切换、路况开关。
2. 卡片添加/编辑/删除，改尺寸后地图自适应；旧 YAML 配置仍可用。
3. 轨迹：单设备/多设备、播放/暂停/停止、倍速、seek、日期模式、隐藏轨迹、适配视野。
4. 回家路线（配 Key/jscode）：驾车/骑行/步行；未配置时按钮置灰并提示。
5. 地址反查；未配置 jscode 时不发请求。
6. 移动端 390×844、844×390、折叠屏尺寸；抽屉拖动、侧边布局、紧凑模式。
7. 控制台无 JS 报错；HA 日志无集成异常。

> 本地调试可起一个简单的静态服务模拟 `/yunshang_map_www/index.html` 与 `/api/states`、`/api/config`、`/api/history/period`；不要提交带真实令牌的测试脚本。

## 发布流程

1. 更新 `CHANGELOG.md`（新版本一节，按 Added/Fixed/Changed 或要点列出）。
2. 三处版本号同步（见上）。
3. 打包并部署到测试 HA：复制 `custom_components/yunshang_map` 到 HA 配置目录，重启 HA，检查面板/卡片。
4. 校验文件一致性（部署目录与仓库 sha256 对比）。
5. 提交并推送：
   ```
   git add -A
   git commit -m "feat/fix: vX.Y.Z — 摘要"
   git push origin main
   ```
6. 在 Gitea 创建 tag/release（`vX.Y.Z`），release notes 摘要 + 指向 CHANGELOG。
7. 部署到生产 HA 前备份旧目录；升级后强制刷新前端缓存。

## 文档维护

- README 只保留简介、功能、安装、快速配置、使用、常见问题、文档索引；**不要再往里堆版本历史**。
- 版本历史写 `CHANGELOG.md`。
- 配置细节写 `docs/CONFIGURATION.md`；架构/实现写 `docs/ARCHITECTURE.md`；问题排查写 `docs/TROUBLESHOOTING.md`；迁移升级写 `docs/UPGRADE.md`。
- 改功能时同步更新相关文档；改截图时更新 `docs/preview-*.jpg`。

## 参考

- Home Assistant 集成开发：<https://developers.home-assistant.io/>
- Leaflet：<https://leafletjs.com/>
- 上游：<https://github.com/dscao/gaode_maps>
