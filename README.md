<p align="center">
  <img src="logo.png" alt="云尚（高德）地图 / Yunshang Gaode Map" width="420">
</p>

# 云尚（高德）地图 · Yunshang Gaode Map

Home Assistant 自定义集成：在高德地图上显示设备追踪（`device_tracker`）位置、运动轨迹回放、回家路线与时间，支持深色 / 浅色 / 跟随系统三种主题。

本项目 Fork 自 [dscao/gaode_maps](https://github.com/dscao/gaode_maps)（墨澜地图），并在此基础上统一了中英文名称、补全中文化界面、增加主题切换并优化了设备对话框的 UI 与交互。

![浅色模式](docs/preview-light.jpg)

<p align="center">
  <img src="docs/preview-dark.jpg" width="49%" alt="深色模式">
  <img src="docs/preview-panel.jpg" width="49%" alt="设备列表">
</p>

---

## 功能特性

- 侧边栏地图面板：`云尚（高德）地图`
- Lovelace 卡片：`custom:yunshang-map`
- 追踪设备优先显示图标（实体图片 / mdi 图标 / 名称推断 / 默认图标）
- 显示设备运动轨迹并回放动画（开始 / 暂停 / 继续 / 停止）
- 显示回家路线（驾车 / 骑行 / 步行），并计算回家用时
- 实时路况、家的位置与范围、设备列表开关
- 三种主题：浅色 / 深色 / 跟随系统（底部主题按钮一键切换）

## 本版本相对上游的改动

1. **中英文名称统一**：仓库 `yunshang_map`，集成域 `yunshang_map`，中文名「云尚（高德）地图」，英文名「Yunshang Gaode Map」，侧边栏、卡片、配置流程、HACS、README 全部一致。
2. **三种主题模式**：新增浅色 / 深色 / 跟随系统，页面底部新增主题配置按钮，与原有缩放、路况、家、设备列表按钮并列摆放；主题选择会被记住，并同步到内嵌卡片。
3. **追踪设备优先显示图标**：地图标记优先使用 `entity_picture`，其次使用实体的 `mdi` 图标，其次按设备名称关键字推断（汽车、自行车、公交、地铁、飞机、轮船、宠物等），最后回退默认定位图标；状态用颜色区分（在家 / 离家 / 区域）。
4. **界面尽可能中文化**：EasyUI 中文语言包、设备列表、状态、按钮、提示、时间区间、错误信息等全部中文。
5. **设备对话框优化**：图标 + 状态徽章列表、设备搜索、手动刷新、轨迹快捷时间区间（今天 / 昨天 / 近 7 天）、时间范围校验、加载与空状态提示、双击设备打开实体详情、Esc 关闭面板、窄屏自适应，并适配深色主题。

> 原有功能（轨迹回放、回家路线与用时、路况、家的范围、卡片嵌入等）均保持不变。

## 安装

### 方式一：手动安装（推荐）

1. 下载本仓库（`main` 分支 zip 或 `git clone http://192.168.19.3:3021/yunshang/yunshang_map.git`）。
2. 将 `custom_components/yunshang_map` 整个目录复制到 Home Assistant 的 `config/custom_components/` 下。
3. 重启 Home Assistant。
4. 打开「设置 → 设备与服务 → 添加集成」，搜索「云尚（高德）地图」并完成配置。

### 方式二：HACS 自定义存储库

HACS → 集成 → 右上角 → 自定义存储库，填入仓库地址 `http://192.168.19.3:3021/yunshang/yunshang_map`，类型选择「集成」，然后下载安装并重启。

## 配置说明

| 配置项 | 说明 |
| --- | --- |
| 高德地图 Web 端 Key | 必填。在 [高德开放平台](https://console.amap.com/dev/key/app) 申请；不正确将无法显示回家路线/时间，也无法使用深色地图。 |
| 安全密钥 jscode | 2021-12 之后申请的 Key 需要同时配置，不需要则留空。 |
| Home Assistant 长期访问令牌 | 推荐配置。手机 App 使用或登录时未保存密码时必须填写。 |
| 追踪设备 | 可在「选项」中选择需要显示的 `device_tracker`；不选择则显示全部。 |

> 提示：追踪设备只针对 `device_tracker` 类型实体。

## 使用说明

- **侧边栏面板**：点击侧边栏「云尚（高德）地图」。底部按钮依次为：放大、缩小、路况、家的位置、家的范围、设备列表、主题模式。
- **主题切换**：点击底部主题按钮，选择「浅色 / 深色 / 跟随系统」，设置会被记住。
- **显示轨迹**：设备列表中选中设备 → 选择时间区间（可用「今天 / 昨天 / 近 7 天」快捷按钮）→ 点击「显示运动轨迹」，随后可用动画按钮回放。
- **回家路线**：在设备列表中勾选设备 → 点击「显示回家路线」，可切换驾车 / 骑行 / 步行。
- **打开实体详情**：点击地图上的设备图标，或双击设备列表中的设备。

## 从「墨澜地图（gaode_maps）」升级

本集成使用了新的集成域 `yunshang_map`，与旧版 `gaode_maps` 不冲突，但需要重新添加一次集成：

1. 删除旧的 `custom_components/gaode_maps` 目录（可选，避免重复）。
2. 安装 `custom_components/yunshang_map` 并重启。
3. 「设置 → 设备与服务 → 添加集成 → 云尚（高德）地图」，重新填入高德 Key、jscode 与长期令牌。

## 致谢

- [dscao/gaode_maps](https://github.com/dscao/gaode_maps)：本项目的直接上游。
- [cxlwill/ha-inkwavemap](https://github.com/cxlwill/ha-inkwavemap)：更早的实现。
- [shaonianzhentan/google_maps](https://github.com/shaonianzhentan/google_maps)：参考实现。
- [高德开放平台](https://lbs.amap.com/)：地图服务。
- [Material Design Icons](https://pictogrammers.com/)：设备图标（Apache License 2.0）。

## 许可

本项目沿用上游的 [GNU General Public License v3.0](LICENSE)。
