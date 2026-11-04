<p align="center">
  <img src="logo.png" alt="云尚（高德）地图 / Yunshang Gaode Map" width="420">
</p>

# 云尚（高德）地图 · Yunshang Gaode Map

> 仓库名 / 集成域：`yunshang_map`；**前端（侧边栏、地图页面、Lovelace 卡片、集成页面）显示名为「定制地图」。**

Home Assistant 自定义集成：在高德地图上显示设备追踪（`device_tracker`）位置、运动轨迹回放、回家路线与时间，支持深色 / 浅色 / 跟随系统三种主题。

本项目 Fork 自 [dscao/gaode_maps](https://github.com/dscao/gaode_maps)（墨澜地图），并在此基础上统一了中英文名称、补全中文化界面、增加主题切换并优化了设备对话框的 UI 与交互。

![浅色模式](docs/preview-light.jpg)

<p align="center">
  <img src="docs/preview-dark.jpg" width="49%" alt="深色模式">
  <img src="docs/preview-panel.jpg" width="49%" alt="设备列表 / 轨迹回放">
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

### v1.1.0 更新

6. **前端显示名改为「定制地图」**：侧边栏入口、地图页面标题、Lovelace 卡片、集成页面统一显示「定制地图」。
7. **设备对话框重构**：改为自绘面板（不再依赖 EasyUI），桌面端为可拖动浮窗、移动端为底部抽屉；分为「设备 / 轨迹回放 / 回家路线」三个页签。
   - 设备：头像图标、状态徽章、地址、距家距离、回家用时；搜索、刷新、**显示/隐藏标记**、**一键追踪（地图跟随）**
   - 轨迹回放：**切换追踪设备时自动切换轨迹**、快捷时间区间、加载提示、动画控制
   - 回家路线：多选设备、出行方式切换、显示/隐藏
   - 「管理追踪设备」可直接跳转集成选项页
8. **缩放与轨迹流畅度优化**：
   - 缩放时不再逐帧刷新工具栏图标（只在 `zoomend` 更新一次）、去掉标记的 CSS 过渡、缓存底部工具栏坐标
   - 轨迹点超过 800 个时自动抽样显示（保留首尾点），并改为**异步加载**，大轨迹不再阻塞页面
   - 移除页面内 EasyUI 依赖（体积与解析开销大幅降低）
9. **修复**：重命名内部 `Map` 类，避免覆盖浏览器原生 `Map` 对象。

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

## 让没有图标的设备显示用户头像 / 图标（纯 HA 配置）

地图标记的图标优先级为：

```
entity_picture（图片） > 实体自定义 icon（mdi 图标） > 按设备名称推断 > 默认图标
```

因此**不需要改插件代码**，直接在 Home Assistant 中配置即可复用现有机制：

1. **用户头像**：在「设置 → 人员」中为每位成员上传/更换头像（`person.*` 实体的 `entity_picture` 就是该头像）。
2. **给 device_tracker 指定头像**：在 `customize.yaml` 中为对应实体补充 `entity_picture`（图片地址取对应 `person` 实体的 `entity_picture`）：

   ```yaml
   device_tracker.hostname0:
     entity_picture: /api/image/serve/<图片ID>/512x512   # 取对应 person 实体的 entity_picture
   ```

   修改后重载配置（开发者工具 → YAML → 重新加载核心配置）或重启 Home Assistant。
3. **只想要图标（不要头像）**：在「设置 → 设备与服务 → 实体」中选择该 `device_tracker`，点击齿轮修改图标（如 `mdi:cellphone`、`mdi:car`），插件会自动读取实体 `icon`。
4. 注意：`/api/image/serve/...` 中的图片 ID 与人员头像绑定，**更换头像后需要同步更新 `customize.yaml` 里的地址**；也可以把头像图片放到 `config/www/` 下，用 `/local/xxx.png` 引用（更稳定）。

> 本仓库的部署实例中，为 4 部手机追踪器和 2 个 GPS 追踪器配置了对应成员的头像，车辆（Tesla / ES6）继续使用各自的 `entity_picture` 车标。

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
