/**
 * 定制地图 - 主页面逻辑
 *
 * 面板结构：设备列表 / 轨迹回放 / 回家路线 三个页签。
 * - 设备页签：搜索、刷新、定位、显示/隐藏标记、切换追踪设备
 * - 轨迹页签：切换追踪设备后自动切换轨迹、快捷时间区间、动画回放
 * - 回家路线页签：多选设备、出行方式、显示/隐藏回家路线
 */
var map = new MapController();
var homePoint = null;
var getDataMode = "client";
var storage = null;
var authToken = null;
var newTokens = null;
var newToken = null;

/* 设备数据与交互状态 */
var deviceStore = {};
var deviceOrder = [];
var hiddenIds = {};
var routeSelected = {};
var searchKeyword = "";
var activeDeviceId = null;   // 当前选中/定位设备
var followDeviceId = null;   // 正在追踪（地图跟随）的设备
var trackedDeviceId = null;  // 当前显示轨迹的设备（兼容旧状态）
var trackSelected = {};      // 轨迹多选：{entityId: true}
var trackSelectedOrder = []; // 选择顺序（决定轨迹颜色）
var trackedDeviceIds = [];   // 已加载轨迹的设备
var playbackState = "idle";  // idle | playing | paused
var trackVisible = false;
var backhomeTrackEnabled = false;
var backhomeTrackType = "drive";
var mapInitialized = false;
var pollTimer = null;
var activeTab = "devices";
var panelVisible = false;
var lastListSignature = "";
var trackSpeedMultiplier = 1;
var hasAutoFitted = false;
var lastTrackDuration = 0;
var lastTrackOriginalCount = 0;
var lastTrackDrawnCount = 0;

/* 卡片内嵌模式 / 历史轨迹 */
var embedMode = false;
var hoursToShow = 0;
var historyTimer = null;
var historyLoaded = false;
var historyStarted = false;

var DEVICE_COLORS = ["#1677ff", "#16a34a", "#f59e0b", "#7c3aed", "#dc2626", "#0891b2", "#ea580c", "#db2777"];

var STORAGE_STATE = "yunshang_map_state";

$(function () {
    storage = window.localStorage;
    embedMode = (query.get("embed") === "1");
    hoursToShow = parseInt(query.get("hours") || "0", 10) || 0;
    initAuthToken();

    /* 优先复用 HA 前端会话（同一登录态），没有父页面时才需要长期令牌 */
    detectDataSource(function () {
        if (dataSource === "token" && !authToken && !newToken) {
            showMapError(t("tokenMissing"), t("tokenMissingDetail"));
            return;
        }

    initStaticUi();
    loadState();
    updateTrackRangeLabel();
    applyRangeModeUi();
    updateAmapCapabilityUi();
    bindUi();
    switchTab(activeTab);

    loadHomePoint(function () {
        var arrZone = [];
        loadZones(arrZone, function () {
            if (homePoint == null) {
                homePoint = { 'lon': 116.397428, 'lat': 39.90923 };
            }
            try {
                if (typeof L === "undefined") {
                    showMapError(t("mapLoadFailed"), t("mapLoadFailedDetail"));
                    return;
                }
                map.init(homePoint, arrZone);
            } catch (e) {
                console.error(e);
                showMapError(t("mapLoadFailed"), t("mapLoadFailedDetail"));
            }
        });
    });

    if (window.YunshangTheme) {
        YunshangTheme.apply();
    }

    setTimeout(function () {
        if (!mapInitialized) {
            showMapError(t("mapLoadFailed"), t("mapLoadFailedDetail"));
        }
    }, 18000);
    });
});

/* ================= 初始化 ================= */

function initAuthToken() {
    try {
        authToken = storage.getItem("authToken"); // 旧版模式
        newTokens = JSON.parse(storage.getItem("tokens")); // 新版 HA:0.76~0.77.1
    } catch (ex) {
        authToken = null;
        newTokens = null;
    }

    if (LongTimeToken != "") {
        newToken = LongTimeToken;
    } else {
        if (newTokens == null) {
            try {
                newTokens = JSON.parse(storage.getItem("hassTokens"));
            } catch (ex) {
                newTokens = null;
            }
        }
        if (newTokens != null) {
            newToken = newTokens.token_type + " " + newTokens.access_token;
        }
    }
}

function initStaticUi() {
    document.getElementById("btnPanelRefresh").innerHTML = ysIcon("refresh");
    document.getElementById("btnPanelClose").innerHTML = ysIcon("close");
    document.getElementById("searchIcon").innerHTML = ysIcon("magnify");
    document.getElementById("fitViewIcon").innerHTML = ysIcon("image-filter-center-focus");
    $("#btnPanelRefresh").attr("title", "刷新设备位置").attr("aria-label", "刷新设备位置");
    $("#btnPanelClose").attr("title", "关闭").attr("aria-label", "关闭");
    $("#trackHint").text("");
    $("#routeHint").text("");
    $("#trackRange").val(String(trackRangeIndex));
    updateTrackRangeLabel();
    $("#seekField").attr("hidden", "hidden");
    $("#seekPosLabel").text("--");
    $("#trackSeek").val("0");
    updateRangeFill(document.getElementById("trackSeek"));
    $("#footerTip").text("");
    $("#btnQuery").text(t("trackShow"));
    $("#btnBackhome").text(t("backShow"));
    $("#linkManageDevices").text("管理追踪设备");
    if (embedMode) {
        $("#linkManageDevices").hide();
    }
    initBasemapSelect();
}

function bindUi() {
    /* 底部工具栏（放大/缩小改为滚轮/双指缩放，不再显示按钮） */
    $("#toolbar_traffic").on("click", function () {
        map.traffic();
        syncToolbarState(["traffic"]);
    });
    $("#toolbar_homepoint").on("click", function () {
        map.homepoint();
        syncToolbarState(["homepoint"]);
    });
    $("#toolbar_homerange").on("click", function () {
        map.homerange();
        syncToolbarState(["homerange"]);
    });
    $("#toolbar_devicelist").on("click", togglePanel);

    /* 适配视野 */
    $("#btnFitView").on("click", function () {
        if (trackVisible) {
            map.fitTrack();
        } else {
            map.fitAll();
        }
    });

    /* 面板开合 */
    $("#btnPanelClose").on("click", closePanel);
    $("#btnPanelRefresh").on("click", function () {
        var btn = this;
        btn.classList.add("is-spinning");
        refreshDevices(true);
        setTimeout(function () {
            btn.classList.remove("is-spinning");
        }, 700);
    });

    /* 页签 */
    $(document).on("click", ".ys-tab", function () {
        switchTab($(this).attr("data-tab"));
    });

    /* 搜索 */
    var searchTimer = null;
    $("#deviceSearch").on("input", function () {
        var value = $(this).val() || "";
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            searchKeyword = value.trim().toLowerCase();
            renderDeviceList(true);
        }, 120);
    });

    /* 设备行：单击定位/选中，双击打开实体详情，按钮点击单独处理 */
    $(document).on("click", ".ys-device-row", function (event) {
        /* 轨迹 / 回家路线页签的行由各自的 checkbox 处理，避免整表重绘时打断勾选 */
        if ($(this).hasClass("ys-track-row") || $(this).hasClass("ys-route-row")) {
            return;
        }
        var id = $(this).attr("data-id");
        if (!id) {
            return;
        }
        var actionBtn = $(event.target).closest("[data-action]");
        if (actionBtn.length) {
            var action = actionBtn.attr("data-action");
            if (action === "toggle-visible") {
                toggleDeviceVisible(id);
            } else if (action === "follow") {
                toggleFollow(id);
            }
            return;
        }
        selectDevice(id, true);
    });
    $(document).on("dblclick", ".ys-device-row", function (event) {
        var id = $(this).attr("data-id");
        if (id) {
            openMoreInfo("device_tracker." + id);
        }
    });

    /* 轨迹页签：回放范围滑块 + 轨迹位置滑块 */
    $("#trackRange").on("input", function () {
        trackRangeIndex = parseInt(this.value, 10) || 0;
        updateTrackRangeLabel();
    });
    $("#trackRange").on("change", function () {
        SaveState();
        if (trackVisible) {
            loadSelectedTracks();
        }
    });
    $("#rangeModeSwitch").on("click", "button[data-mode]", function () {
        var mode = $(this).attr("data-mode");
        if (!mode || mode === trackRangeMode) {
            return;
        }
        trackRangeMode = mode;
        if (mode === "date") {
            ensureDateRangeDefaults();
            validateDateRange(false);
        }
        applyRangeModeUi();
        SaveState();
        if (trackVisible) {
            loadSelectedTracks();
        }
    });
    $("#trackDateFrom, #trackDateTo").on("change", function () {
        var valid = validateDateRange(true);
        updateTrackRangeLabel();
        SaveState();
        if (valid && trackVisible) {
            loadSelectedTracks();
        }
    });
    $("#trackSeek").on("input", function () {
        seekDragging = true;
        var progress = parseFloat(this.value) / 1000;
        if (playbackState === "playing") {
            map.DrawPause();
            playbackState = "paused";
            updatePlaybackUi();
        }
        updateRangeFill(this);
        map.seek(progress);
        if (progress >= 0.999) {
            playbackState = "finished";
            updatePlaybackUi();
        } else if (playbackState !== "paused") {
            playbackState = "paused";
            updatePlaybackUi();
        }
    });
    $("#trackSeek").on("change", function () {
        seekDragging = false;
    });
    $("#btnQuery").on("click", onTrackButtonClick);
    $("#trackDeviceList").on("change", "input[type=checkbox]", function () {
        var id = $(this).val();
        if (!id) {
            return;
        }
        if (this.checked) {
            trackSelected[id] = true;
            if (trackSelectedOrder.indexOf(id) < 0) {
                trackSelectedOrder.push(id);
            }
        } else {
            delete trackSelected[id];
            trackSelectedOrder = trackSelectedOrder.filter(function (item) {
                return item !== id;
            });
        }
        $(this).closest(".ys-track-row").toggleClass("is-active", this.checked);
        updateTrackColorDots();
        SaveState();
        if (trackVisible) {
            loadSelectedTracks();
        }
    });
    $(document).on("click", "#trackSpeed [data-speed]", function () {
        setTrackSpeed(parseFloat($(this).attr("data-speed")));
    });
    $("#btnPlayPause").on("click", function () {
        togglePlayPause();
    });
    $("#btnStopPlay").on("click", function () {
        stopPlayback();
    });

    /* 回家路线页签 */
    $("#backhomeMode").on("click", "button[data-mode]", function () {
        backhomeTrackType = $(this).attr("data-mode");
        $("#backhomeMode button").removeClass("is-active");
        $(this).addClass("is-active");
        SaveState();
        if (backhomeTrackEnabled) {
            drawBackhomeRoutes();
        }
    });
    $("#routeDeviceList").on("change", "input[type=checkbox]", function () {
        var id = $(this).val();
        routeSelected[id] = this.checked;
        SaveState();
        if (backhomeTrackEnabled) {
            drawBackhomeRoutes();
        }
        updateRouteHint();
    });
    $("#btnBackhome").on("click", onBackhomeButtonClick);

    /* 底图切换 */
    $("#basemapSelect").on("change", function () {
        var type = $(this).val();
        if (type && map.getBasemap && map.getBasemap() !== type) {
            map.setBasemap(type);
            try {
                window.localStorage.setItem("yunshang_map_basemap", type);
            } catch (e) {
                /* 忽略 */
            }
        }
    });

    /* 管理追踪设备 -> 跳转 HA 集成选项 */
    $("#linkManageDevices").on("click", function () {
        try {
            window.parent.location.href = "/config/integrations/integration/yunshang_map";
        } catch (e) {
            ysToast("请在 Home Assistant「设置 → 设备与服务」中管理追踪设备", true);
        }
    });

    /* 桌面端支持拖动面板 */
    initPanelDrag();

    /* 键盘 & 窗口事件 */
    $(document).on("keydown", function (event) {
        if (event.key !== "Escape") {
            return;
        }
        var themePanel = document.getElementById("themePanel");
        if (themePanel && themePanel.classList.contains("open")) {
            return; // 主题面板自己处理
        }
        if (panelVisible) {
            closePanel();
        }
    });

    var resizeTimer = null;
    $(window).on("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(onViewportChange, 150);
    });
}

/* ================= 面板 ================= */

function openPanel() {
    var panel = document.getElementById("devicePanel");
    panel.hidden = false;
    panelVisible = true;
    document.body.classList.add("ys-panel-open");
    layoutPanel();
    requestAnimationFrame(function () {
        panel.classList.add("is-open");
        updatePanelCompact();
    });
    syncToolbarState(["devicelist"]);
    renderDeviceList(true);
}

function closePanel() {
    var panel = document.getElementById("devicePanel");
    panelVisible = false;
    document.body.classList.remove("ys-panel-open");
    panel.classList.remove("is-open");
    setTimeout(function () {
        if (!panelVisible) {
            panel.hidden = true;
        }
    }, 260);
    syncToolbarState(["devicelist"]);
}

function togglePanel() {
    if (panelVisible) {
        closePanel();
    } else {
        openPanel();
    }
}

function switchTab(tab) {
    if (!tab) {
        return;
    }
    activeTab = tab;
    $(".ys-tab").removeClass("is-active").filter('[data-tab="' + tab + '"]').addClass("is-active");
    $(".ys-pane").removeClass("is-active").filter('[data-pane="' + tab + '"]').addClass("is-active");
    var body = document.querySelector(".ys-panel-body");
    if (body) {
        body.scrollTop = 0;
    }
    SaveState();
    updatePanelCompact();
    if (tab === "track") {
        renderTrackDeviceList();
    } else if (tab === "route") {
        renderRouteList();
    }
}

function isSheetMode() {
    return window.innerWidth <= 560 || window.innerHeight <= 520;
}

function isSidePanelMode() {
    return window.innerHeight <= 520 && window.innerWidth >= 600;
}

/** 根据抽屉高度切换紧凑模式：先收起设备列表，再收起次要控件，保留播放/轨迹位置给地图 */
function updatePanelCompact() {
    var card = document.querySelector('#devicePanel .ys-panel-card');
    if (!card) {
        return;
    }
    var trackPane = document.querySelector('.ys-pane[data-pane="track"]');
    var apply = !!(trackPane && trackPane.classList.contains("is-active"));
    var loaded = !!trackVisible;
    var h = card.clientHeight;
    card.classList.toggle("is-compact-1", apply && h < 560);
    card.classList.toggle("is-compact-2", apply && loaded && h < 470);
    card.classList.toggle("is-compact-3", apply && loaded && h < 350);
}

function layoutPanel() {
    var panel = document.getElementById("devicePanel");
    var card = panel.querySelector(".ys-panel-card");
    if (!card) {
        return;
    }
    if (isSheetMode()) {
        card.style.width = "";
        card.style.height = "";
        card.style.left = "";
        card.style.top = "";
        card.style.transform = "";
    }
}

function onViewportChange() {
    layoutPanel();
    updatePanelCompact();
}

/* 手机底部抽屉：拖动调节高度 / 轻点收起展开；桌面端：拖动移动浮窗 */
function initPanelDrag() {
    var panel = document.getElementById("devicePanel");
    var card = panel.querySelector(".ys-panel-card");
    var header = document.getElementById("panelHeader");
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var sheetDrag = null;

    header.addEventListener("pointerdown", function (event) {
        if ($(event.target).closest("button").length) {
            return;
        }
        if (isSheetMode()) {
            if (isSidePanelMode()) {
                return; /* 横屏侧栏固定，不拖动 */
            }
            var rect = card.getBoundingClientRect();
            sheetDrag = {
                startY: event.clientY,
                startH: rect.height,
                moved: false
            };
            card.classList.add("is-dragging");
            try {
                header.setPointerCapture(event.pointerId);
            } catch (e) {
                /* 忽略 */
            }
            return;
        }
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        var cardRect = card.getBoundingClientRect();
        startLeft = cardRect.left;
        startTop = cardRect.top;
        card.classList.add("is-dragging");
        try {
            header.setPointerCapture(event.pointerId);
        } catch (e) {
            /* 忽略 */
        }
    });

    header.addEventListener("pointermove", function (event) {
        if (sheetDrag) {
            var dy = event.clientY - sheetDrag.startY;
            if (Math.abs(dy) > 4) {
                sheetDrag.moved = true;
            }
            var vh = window.innerHeight;
            var h = sheetDrag.startH - dy;
            h = Math.max(vh * 0.26, Math.min(h, vh - 8));
            card.style.height = Math.round(h) + "px";
            updatePanelCompact();
            return;
        }
        if (!dragging) {
            return;
        }
        var left = startLeft + (event.clientX - startX);
        var top = startTop + (event.clientY - startY);
        left = Math.max(4, Math.min(left, window.innerWidth - card.offsetWidth - 4));
        top = Math.max(4, Math.min(top, window.innerHeight - 80));
        card.style.left = left + "px";
        card.style.top = top + "px";
        card.style.transform = "none";
    });

    function endDrag() {
        if (sheetDrag) {
            var vh = window.innerHeight;
            var h = card.getBoundingClientRect().height;
            card.classList.remove("is-dragging");
            if (h < vh * 0.30) {
                /* 拖到底部：保持当前高度直接关闭，避免关闭前先弹回初始高度 */
                card.style.height = Math.round(h) + "px";
                closePanel();
                setTimeout(function () {
                    if (!panelVisible) {
                        card.style.height = "";
                    }
                }, 280);
            } else if (sheetDrag.moved) {
                /* 吸附到 45% / 68% / 90% 三档 */
                var snaps = [vh * 0.45, vh * 0.68, vh * 0.90];
                var best = snaps[0];
                for (var si = 1; si < snaps.length; si++) {
                    if (Math.abs(snaps[si] - h) < Math.abs(best - h)) {
                        best = snaps[si];
                    }
                }
                card.style.height = Math.round(best) + "px";
                updatePanelCompact();
            } else {
                /* 轻点把手：展开 / 收起切换 */
                card.style.height = (h > vh * 0.72)
                    ? Math.round(vh * 0.45) + "px"
                    : Math.round(vh * 0.90) + "px";
            }
            sheetDrag = null;
            return;
        }
        if (!dragging) {
            return;
        }
        dragging = false;
        card.classList.remove("is-dragging");
    }

    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);

    /* 高度变化动画结束后刷新紧凑模式（吸附/回弹等） */
    card.addEventListener("transitionend", function (event) {
        if (event.propertyName === "height") {
            updatePanelCompact();
        }
    });
}

/* ================= 设备列表 ================= */

function matchesSearch(device) {
    if (!searchKeyword) {
        return true;
    }
    var text = ((device.name || "") + " " + (device.id || "") + " " + (device.state_label || "")).toLowerCase();
    return text.indexOf(searchKeyword) >= 0;
}

function visibleDevices() {
    var rows = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var device = deviceStore[deviceOrder[i]];
        if (device && matchesSearch(device)) {
            rows.push(device);
        }
    }
    return rows;
}

function deviceSignature(device) {
    return [
        device.id,
        device.name,
        device.state_label,
        device.state_cls,
        device.address,
        device.distance_text,
        device.travel_time,
        device.hidden ? 1 : 0,
        followDeviceId === device.id ? 1 : 0,
        activeDeviceId === device.id ? 1 : 0,
        device.icon_kind,
        device.icon_key,
        device.icon_picture
    ].join("|");
}

function renderDeviceList(force) {
    var rows = visibleDevices();
    var signature = rows.map(deviceSignature).join("||");
    var count = deviceOrder.length;

    $("#panelCount").text(String(count));
    $("#panelTitleText").text(t("deviceListTitle"));
    $("#footerTip").text(t("deviceCount", { n: rows.length }));
    updateEmptyState(rows.length);

    if (!force && signature === lastListSignature) {
        return;
    }
    lastListSignature = signature;

    var html = [];
    for (var i = 0; i < rows.length; i++) {
        html.push(renderDeviceRow(rows[i]));
    }
    var list = document.getElementById("deviceList");
    var scrollTop = list.scrollTop;
    list.innerHTML = html.join("");
    list.scrollTop = scrollTop;
}

/** 设备列表通用：头像 */
function deviceAvatarHtml(device) {
    var avatar;
    if (device.icon_picture) {
        avatar = '<img src="' + escapeHtml(device.icon_picture) + '" alt="" loading="lazy">';
    } else {
        avatar = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
            (device.icon_path || ysIconPath("map-marker-account") || "") + '"/></svg>';
    }
    return '<div class="ys-avatar ys-avatar-' + (device.state_cls || "zone") + '">' + avatar + '</div>';
}

/** 设备列表通用：名称 + 状态 + 副标题（距离/用时/地址） */
function deviceInfoHtml(device) {
    var stateBadge = '<span class="ys-state ys-state-' + (device.state_cls || "zone") + '">' +
        escapeHtml(device.state_label || device.state || "") + '</span>';

    var subParts = [];
    if (device.distance_text) {
        subParts.push(escapeHtml(device.distance_text));
    }
    if (device.travel_time) {
        subParts.push(t("travelTime") + " " + escapeHtml(device.travel_time));
    }
    if (device.address) {
        subParts.push(escapeHtml(device.address));
    }
    var subText = subParts.length ? subParts.join(" · ") : "—";

    return '<div class="ys-device-main">' +
        '<div class="ys-device-name"><span class="ys-device-name-text">' +
        escapeHtml(device.name || device.id) + '</span>' + stateBadge + '</div>' +
        '<div class="ys-device-sub">' + subText + '</div>' +
        '</div>';
}

/** 设备列表通用：整行（三个页签共用同一套样式） */
function deviceRowHtml(device, trailingHtml, extraClass) {
    return '<div class="ys-device-row ' + (extraClass || "") + '" data-id="' +
        escapeHtml(device.id) + '" role="listitem">' +
        deviceAvatarHtml(device) + deviceInfoHtml(device) + (trailingHtml || '') +
        '</div>';
}

function renderDeviceRow(device) {
    var followActive = followDeviceId === device.id;
    var hidden = !!device.hidden;

    var actions = '<div class="ys-device-actions">' +
        '<button type="button" class="ys-icon-btn' + (hidden ? "" : " is-muted") +
        '" data-action="toggle-visible" title="' + (hidden ? "显示地图标记" : "隐藏地图标记") +
        '" aria-label="' + (hidden ? "显示地图标记" : "隐藏地图标记") + '">' +
        ysIcon(hidden ? "eye-off" : "eye") + '</button>' +
        '<button type="button" class="ys-icon-btn' + (followActive ? " is-on" : "") +
        '" data-action="follow" title="' + (followActive ? "取消追踪" : "追踪该设备") +
        '" aria-label="' + (followActive ? "取消追踪" : "追踪该设备") + '">' +
        ysIcon("crosshairs-gps") + '</button>' +
        '</div>';

    return deviceRowHtml(device, actions, activeDeviceId === device.id ? "is-active" : "");
}

function updateEmptyState(count) {
    var empty = document.getElementById("deviceEmpty");
    if (count > 0) {
        empty.hidden = true;
    } else {
        empty.textContent = searchKeyword ? t("searchNoResult") : t("noDevices");
        empty.hidden = false;
    }
}

function selectDevice(deviceId, locate) {
    if (!deviceId || !deviceStore[deviceId]) {
        return;
    }
    activeDeviceId = deviceId;
    renderTrackDeviceList();
    if (locate && hasPosition(deviceStore[deviceId])) {
        map.center({ lon: deviceStore[deviceId].lon, lat: deviceStore[deviceId].lat });
    }
    renderDeviceList();
    SaveState();
}

function toggleDeviceVisible(deviceId) {
    var device = deviceStore[deviceId];
    if (!device) {
        return;
    }
    device.hidden = !device.hidden;
    hiddenIds[deviceId] = device.hidden ? 1 : 0;
    map.showdevicemarker(deviceId, !device.hidden);
    renderDeviceList(true);
    SaveState();
    ysToast(device.hidden ? "已隐藏「" + device.name + "」的地图标记" : "已显示「" + device.name + "」的地图标记");
}

function toggleFollow(deviceId) {
    var device = deviceStore[deviceId];
    if (!device) {
        return;
    }
    if (followDeviceId === deviceId) {
        followDeviceId = null;
        ysToast("已取消追踪「" + device.name + "」");
    } else {
        followDeviceId = deviceId;
        activeDeviceId = deviceId;
        if (hasPosition(device)) {
            map.center({ lon: device.lon, lat: device.lat });
        }
        ysToast("正在追踪「" + device.name + "」，地图将跟随其位置");
        renderTrackDeviceList();
    }
    renderDeviceList(true);
    SaveState();
}

/* ================= 数据刷新 ================= */

function refreshDevices(showErrors) {
    if (document.hidden && !showErrors) {
        return;
    }
    haFetchStates(function (states) {
        if (!states) {
            if (showErrors) {
                ysToast("刷新设备列表失败，请检查登录状态/长期令牌", true);
            }
            return;
        }
        handleStates(states);
    });
}

function handleStates(states) {
    if (!states || !states.length) {
        return;
    }
    var idlist = (DeviceTrackerIDList || "").split(",").map(function (v) {
        v = v.trim();
        if (v && v.indexOf(".") === -1) {
            v = "device_tracker." + v;
        }
        return v;
    }).filter(function (v) {
        return v !== "";
    });

    for (var index in states) {
        var stateObj = states[index];
        if (!stateObj || !stateObj.entity_id) {
            continue;
        }
        var domain = stateObj.entity_id.split(".")[0];
        if (domain !== "device_tracker" && domain !== "geo_location") {
            continue;
        }
        if (idlist.length > 0 && idlist.indexOf(stateObj.entity_id) === -1) {
            continue;
        }
        if (idlist.length === 0 && domain !== "device_tracker") {
            continue;
        }
        var attrs = stateObj.attributes || {};
        if (attrs.longitude === undefined || attrs.longitude === null ||
            attrs.latitude === undefined || attrs.latitude === null) {
            continue;
        }
        var entityId = stateObj.entity_id;
        var previous = deviceStore[entityId];
        var device = ysBuildDeviceRow(entityId, stateObj);
        device.hidden = previous ? !!previous.hidden : !!hiddenIds[entityId];
        device.distance_text = formatDistance(homePoint, device.lon, device.lat);
        if (!previous) {
            deviceOrder.push(entityId);
        }
        deviceStore[entityId] = device;

        map.drawdevicemarker(entityId, device.name, { lon: device.lon, lat: device.lat },
            deviceIconInfo(device), { cls: device.state_cls }, device.accuracy);

        if (!previous && device.hidden) {
            map.showdevicemarker(entityId, false);
        }
    }

    if (!deviceOrder.length) {
        updateEmptyState(0);
        return;
    }

    /* 追踪模式下跟随设备位置 */
    if (followDeviceId) {
        var followed = deviceStore[followDeviceId];
        if (followed && hasPosition(followed)) {
            map.center({ lon: followed.lon, lat: followed.lat });
        }
    } else if (!hasAutoFitted && mapInitialized) {
        hasAutoFitted = true;
        setTimeout(function () {
            if (deviceOrder.length > 0) {
                map.fitAll();
            }
        }, 300);
    }

    renderTrackDeviceList();
    renderRouteList();
    renderDeviceList();

    if (embedMode && hoursToShow && deviceOrder.length && !historyStarted) {
        startHistoryPolling();
    }
}

/** 设备的图标信息（用于地图标记与轨迹动画） */
function deviceIconInfo(device) {
    return {
        kind: device.icon_kind,
        picture: device.icon_picture,
        path: device.icon_path,
        key: device.icon_key
    };
}

function formatDistance(from, lon, lat) {
    if (!from || lon === undefined || lon === null || lat === undefined || lat === null) {
        return "";
    }
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (lat - from.lat) * rad;
    var dLon = (lon - from.lon) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(from.lat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var meters = R * c;
    if (meters < 1000) {
        return "距家 " + Math.round(meters) + " 米";
    }
    return "距家 " + (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + " 公里";
}

function hasPosition(device) {
    return !!device && device.lon !== undefined && device.lon !== null &&
        device.lat !== undefined && device.lat !== null;
}

/* ================= 轨迹 ================= */

function renderTrackDeviceList() {
    var container = document.getElementById("trackDeviceList");
    if (!container) {
        return;
    }
    /* 清理已失效的选择 */
    var cleanOrder = [];
    for (var oi = 0; oi < trackSelectedOrder.length; oi++) {
        var oid = trackSelectedOrder[oi];
        if (trackSelected[oid] && deviceStore[oid]) {
            cleanOrder.push(oid);
        } else {
            delete trackSelected[oid];
        }
    }
    trackSelectedOrder = cleanOrder;

    var html = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var d = deviceStore[deviceOrder[i]];
        if (!d || !hasPosition(d)) {
            continue;
        }
        var checked = !!trackSelected[d.id];
        var colorDot = '<span class="ys-track-color" style="background:' +
            (checked ? trackColorFor(d.id) : "transparent") + '" aria-hidden="true"></span>';
        var checkbox = '<input class="ys-route-check" type="checkbox" value="' +
            escapeHtml(d.id) + '"' + (checked ? " checked" : "") +
            ' aria-label="选择 ' + escapeHtml(d.name) + '">';
        html.push('<label class="ys-device-row ys-track-row' + (checked ? " is-active" : "") +
            '" data-id="' + escapeHtml(d.id) + '">' +
            deviceAvatarHtml(d) + deviceInfoHtml(d) + colorDot + checkbox + '</label>');
    }
    container.innerHTML = html.length ? html.join("") : '<div class="ys-hint">暂无可选设备</div>';
    updatePlaybackUi();
}

function updateTrackSelectSelection() {
    renderTrackDeviceList();
}

/** 只更新轨迹颜色圆点（不重建列表，避免点击时 DOM 被替换） */
function updateTrackColorDots() {
    $("#trackDeviceList .ys-track-row").each(function () {
        var id = $(this).attr("data-id");
        var index = trackSelectedOrder.indexOf(id);
        var color = index >= 0 ? DEVICE_COLORS[index % DEVICE_COLORS.length] : "transparent";
        $(this).find(".ys-track-color").css("background", color);
    });
}

/* 回放范围：从 5 分钟到 7 天（对数感分布） */
var TRACK_RANGES = [
    { hours: 5 / 60, label: "近 5 分钟" },
    { hours: 15 / 60, label: "近 15 分钟" },
    { hours: 0.5, label: "近 30 分钟" },
    { hours: 1, label: "近 1 小时" },
    { hours: 3, label: "近 3 小时" },
    { hours: 6, label: "近 6 小时" },
    { hours: 12, label: "近 12 小时" },
    { hours: 24, label: "近 1 天" },
    { hours: 48, label: "近 2 天" },
    { hours: 168, label: "近 7 天" }
];
var trackRangeIndex = 7;
var trackRangeMode = "slider"; /* slider | date */

/* 高德服务能力（回家路线 / 地址反查需要 Key + jscode） */
function getAmapCapability() {
    var key = (window.GaodeMapKey || "").trim();
    var jscode = (window.GaodeMapjscode || "").trim();
    if (!key) {
        return { ok: false, reason: "未配置高德地图 Key，回家路线与地址反查不可用" };
    }
    if (!jscode) {
        return { ok: false, reason: "未配置高德安全密钥 jscode，回家路线与地址反查不可用" };
    }
    return { ok: true, reason: "" };
}
var seekDragging = false;
var seekGeoToken = 0;
var seekGeoTimer = null;

/* 数据源：优先复用 Home Assistant 前端当前登录会话（无需长期令牌），失败才退回 REST + 令牌 */
var parentHass = null;
var dataSource = "token";

function getParentHass() {
    try {
        if (!window.parent || window.parent === window) {
            return null;
        }
        var doc = window.parent.document;
        if (!doc) {
            return null;
        }
        var ha = doc.querySelector("home-assistant");
        if (ha && ha.hass && ha.hass.connection) {
            return ha.hass;
        }
    } catch (e) {
        /* 跨域或父页面不可访问 */
    }
    return null;
}

/** 检测是否内嵌在 HA 中：是则复用 HA 前端会话（WebSocket），否则使用长期令牌走 REST */
function detectDataSource(callback) {
    parentHass = getParentHass();
    if (parentHass) {
        dataSource = "hass";
        callback();
        return;
    }
    var started = Date.now();
    (function poll() {
        parentHass = getParentHass();
        if (parentHass) {
            dataSource = "hass";
            callback();
            return;
        }
        if (Date.now() - started > 3000) {
            dataSource = "token";
            callback();
            return;
        }
        setTimeout(poll, 150);
    })();
}

/** 取全部状态（WS 优先，REST 兜底） */
function haFetchStates(callback) {
    if (dataSource === "hass" && parentHass) {
        parentHass.callWS({ type: "get_states" })
            .then(function (states) { callback(states || []); })
            .catch(function () { callback(null); });
        return;
    }
    $.ajax({
        type: "GET",
        url: HomeAssistantWebAPIUrl + "/api/states",
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: true,
        dataType: "json",
        success: function (states) { callback(states || []); },
        error: function () { callback(null); }
    });
}

/** 取 HA 配置里的家坐标（WS 优先） */
function haFetchHome(callback) {
    if (dataSource === "hass" && parentHass) {
        var cfg = parentHass.config || {};
        if (cfg.latitude !== undefined && cfg.longitude !== undefined) {
            callback({ lon: cfg.longitude, lat: cfg.latitude });
            return;
        }
        parentHass.callWS({ type: "get_config" })
            .then(function (data) {
                callback(data && data.latitude !== undefined ? { lon: data.longitude, lat: data.latitude } : null);
            })
            .catch(function () { callback(null); });
        return;
    }
    $.ajax({
        type: "GET",
        url: HomeAssistantWebAPIUrl + "/api/config",
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: true,
        dataType: "json",
        success: function (data) {
            if (typeof data === "string") {
                data = $.parseJSON(data);
            }
            callback({ lon: data.longitude, lat: data.latitude });
        },
        error: function () { callback(null); }
    });
}

/** 通过 HA WebSocket 取历史（复用当前登录会话，无需长期令牌） */
function fetchHistoryWs(entityIds, from, to, callback) {
    if (!(dataSource === "hass" && parentHass)) {
        callback(null);
        return;
    }
    parentHass.callWS({
        type: "history/history_during_period",
        start_time: from.toISOString(),
        end_time: to.toISOString(),
        entity_ids: entityIds,
        minimal_response: false,
        no_attributes: false
    }).then(function (result) {
        callback(result || {});
    }).catch(function () {
        callback(null);
    });
}

/** 把一条历史状态转换成轨迹点（兼容 REST 与 WS 两种结构） */
function historyStateToPoint(n) {
    var attrs = n.attributes || n.a || {};
    var lon = attrs.longitude;
    var lat = attrs.latitude;
    if (lon === null || lon === undefined || lon === "" || lat === null || lat === undefined || lat === "") {
        return null;
    }
    var lastUpdated = n.last_updated;
    if (!lastUpdated && n.lu !== undefined) {
        lastUpdated = new Date(Number(n.lu) * 1000).toISOString();
    }
    return {
        longitude: lon,
        latitude: lat,
        lastseen: attrs.lastseen,
        latest_report_time: attrs.latest_report_time,
        last_updated: lastUpdated,
        address: attrs.address || attrs.location_name || attrs.geocoded_location || "",
        updatedate: (attrs.lastseen ? "最后出现：" + attrs.lastseen + "<br/>" : "") +
            (attrs.latest_report_time ? "上报时间：" + attrs.latest_report_time + "<br/>记录时间：" : "") +
            (getDatetime(lastUpdated) ? "" + getDatetime(lastUpdated) : ""),
        lnglat: [lon, lat]
    };
}

function getTrackRange() {
    return TRACK_RANGES[trackRangeIndex] || TRACK_RANGES[7];
}

function updateTrackRangeLabel() {
    var label = document.getElementById("trackRangeLabel");
    if (label) {
        if (trackRangeMode === "date") {
            var fromEl = document.getElementById("trackDateFrom");
            var toEl = document.getElementById("trackDateTo");
            var from = fromEl ? new Date(fromEl.value) : null;
            var to = toEl ? new Date(toEl.value) : null;
            label.textContent = "自定义";
            if (from && to && !isNaN(from.getTime()) && !isNaN(to.getTime())) {
                label.title = p(from.getMonth() + 1) + "/" + p(from.getDate()) + " " + p(from.getHours()) + ":" + p(from.getMinutes()) +
                    " ~ " + p(to.getMonth() + 1) + "/" + p(to.getDate()) + " " + p(to.getHours()) + ":" + p(to.getMinutes());
            } else {
                label.title = "请选择开始/结束时间";
            }
        } else {
            label.textContent = getTrackRange().label;
            label.title = "";
        }
    }
    updateRangeFill(document.getElementById("trackRange"));
}

/** Date -> datetime-local 输入框格式 */
function toLocalInputValue(date) {
    return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate()) +
        "T" + p(date.getHours()) + ":" + p(date.getMinutes());
}

function ensureDateRangeDefaults() {
    var fromEl = document.getElementById("trackDateFrom");
    var toEl = document.getElementById("trackDateTo");
    if (!fromEl || !toEl || (fromEl.value && toEl.value)) {
        return;
    }
    var to = new Date();
    var from = new Date(to.getTime() - getTrackRange().hours * 3600 * 1000);
    fromEl.value = toLocalInputValue(from);
    toEl.value = toLocalInputValue(to);
}

/** 校验日期模式的时间范围 */
function validateDateRange(notify) {
    var fromEl = document.getElementById("trackDateFrom");
    var toEl = document.getElementById("trackDateTo");
    var hint = document.getElementById("dateRangeHint");
    var from = fromEl ? new Date(fromEl.value) : null;
    var to = toEl ? new Date(toEl.value) : null;
    var valid = !!(from && to && !isNaN(from.getTime()) && !isNaN(to.getTime()) && from.getTime() < to.getTime());
    if (hint) {
        hint.textContent = valid ? "" : "请选择有效的开始/结束时间（开始需早于结束）";
        hint.classList.toggle("is-error", !valid);
    }
    if (!valid && notify) {
        ysToast("请选择有效的开始/结束时间", true);
    }
    return valid;
}

function getTimeRange() {
    if (trackRangeMode === "date") {
        var fromEl = document.getElementById("trackDateFrom");
        var toEl = document.getElementById("trackDateTo");
        var from = fromEl ? new Date(fromEl.value) : null;
        var to = toEl ? new Date(toEl.value) : null;
        if (from && to && !isNaN(from.getTime()) && !isNaN(to.getTime()) && from.getTime() < to.getTime()) {
            return { from: from, to: to };
        }
    }
    var hours = getTrackRange().hours;
    var end = new Date();
    var start = new Date(end.getTime() - hours * 3600 * 1000);
    return { from: start, to: end };
}

/** 应用“滑动条/日期”模式到 UI */
function applyRangeModeUi() {
    var scope = document.getElementById("rangeScope");
    if (!scope) {
        return;
    }
    var isDate = trackRangeMode === "date";
    if (isDate) {
        ensureDateRangeDefaults();
    }
    scope.classList.toggle("is-date", isDate);
    $("#rangeModeSwitch button").removeClass("is-active")
        .filter('[data-mode="' + trackRangeMode + '"]').addClass("is-active");
    updateTrackRangeLabel();
}

/** 更新 range 滑块的已选填充比例 */
function updateRangeFill(el) {
    if (!el) {
        return;
    }
    var max = parseFloat(el.max) || 100;
    var value = parseFloat(el.value) || 0;
    var pct = Math.max(0, Math.min(100, (value / max) * 100));
    el.style.setProperty("--ys-range-pct", pct + "%");
}

/** 把进度条时间戳格式化为 “MM/DD HH:mm” */
function formatSeekTime(ts) {
    if (!ts) {
        return "--";
    }
    var d = new Date(ts);
    if (isNaN(d.getTime())) {
        return "--";
    }
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/** 无区域/地址时，用经纬度反查地址（带节流与缓存） */
function requestSeekGeocode(lon, lat, token) {
    seekGeoToken = token;
    if (seekGeoTimer) {
        clearTimeout(seekGeoTimer);
    }
    seekGeoTimer = setTimeout(function () {
        var current = seekGeoToken;
        map.reverseGeocode(lon, lat, function (address) {
            if (current !== seekGeoToken || !address) {
                return;
            }
            var addr = document.getElementById("seekAddrLabel");
            if (addr) {
                addr.textContent = address;
                addr.title = address;
                addr.hidden = false;
            }
        });
    }, 260);
}

function updateSeekUi(info) {
    if (!info) {
        return;
    }
    var progress = Math.max(0, Math.min(1, Number(info.progress) || 0));
    var seek = document.getElementById("trackSeek");
    if (seek && !seekDragging) {
        seek.value = String(Math.round(progress * 1000));
        updateRangeFill(seek);
    }
    var addr = document.getElementById("seekAddrLabel");
    if (addr) {
        var text = info.address || "";
        addr.textContent = text;
        addr.title = text;
        addr.hidden = !text;
        addr.classList.remove("is-disabled");
        if (!text && info.lon !== undefined && info.lon !== null) {
            var cap = getAmapCapability();
            if (cap.ok) {
                requestSeekGeocode(info.lon, info.lat, ++seekGeoToken);
            } else {
                var reason = (window.GaodeMapKey || "").trim()
                    ? "未配置 jscode"
                    : "未配置高德 Key";
                text = reason;
                addr.textContent = reason;
                addr.title = cap.reason;
                addr.hidden = false;
                addr.classList.add("is-disabled");
            }
        } else {
            seekGeoToken++;
            if (seekGeoTimer) {
                clearTimeout(seekGeoTimer);
            }
        }
    }
    var label = document.getElementById("seekPosLabel");
    if (label) {
        label.textContent = info.ts ? formatSeekTime(info.ts) : (Math.round(progress * 100) + "%");
    }
}

function setTrackHint(text, isError) {
    var hint = document.getElementById("trackHint");
    hint.textContent = text || "";
    hint.classList.toggle("is-error", !!isError);
}

function onTrackButtonClick() {
    if (!trackVisible) {
        loadSelectedTracks();
    } else {
        hideTrack();
    }
}

var trackRequestSeq = 0;

/** 当前选中的轨迹设备（按选择顺序） */
function selectedTrackIds() {
    var ids = [];
    for (var i = 0; i < trackSelectedOrder.length; i++) {
        var id = trackSelectedOrder[i];
        if (trackSelected[id] && deviceStore[id] && hasPosition(deviceStore[id])) {
            ids.push(id);
        }
    }
    return ids;
}

function trackColorFor(id) {
    var index = trackSelectedOrder.indexOf(id);
    if (index < 0) {
        index = 0;
    }
    return DEVICE_COLORS[index % DEVICE_COLORS.length];
}

/* 播放 / 暂停 / 停止 */
function updatePlaybackUi() {
    var play = $("#btnPlayPause");
    var stop = $("#btnStopPlay");
    play.text(playbackState === "playing" ? "暂停" : "播放");
    stop.prop("disabled", playbackState === "idle");
}

function resetPlaybackUi() {
    playbackState = "idle";
    updatePlaybackUi();
}

function togglePlayPause() {
    if (!trackVisible) {
        return;
    }
    if (playbackState === "playing") {
        map.DrawPause();
        playbackState = "paused";
    } else {
        if (playbackState === "paused") {
            map.DrawResume();
        } else {
            map.DrawStart();
        }
        playbackState = "playing";
    }
    updatePlaybackUi();
}

function stopPlayback() {
    if (!trackVisible) {
        return;
    }
    map.DrawStop();
    map.seek(0);
    resetPlaybackUi();
    updatePlaybackUi();
    updateTrackHintText();
}

/** 一次加载并同时显示多个设备的轨迹 */
function loadSelectedTracks() {
    if (trackRangeMode === "date" && !validateDateRange(true)) {
        return;
    }
    var ids = selectedTrackIds();
    if (!ids.length) {
        /* 默认选中第一个可用设备，方便直接查看 */
        for (var fi = 0; fi < deviceOrder.length; fi++) {
            if (hasPosition(deviceStore[deviceOrder[fi]])) {
                trackSelected[deviceOrder[fi]] = true;
                trackSelectedOrder = [deviceOrder[fi]];
                renderTrackDeviceList();
                ids = selectedTrackIds();
                break;
            }
        }
    }
    if (!ids.length) {
        ysToast(t("noDeviceSelected"), true);
        switchTab("devices");
        return;
    }
    turnOffBackhomeRoutes();
    setTrackHint(t("trackLoading"));
    var seq = ++trackRequestSeq;
    var results = {};
    var pending = ids.length;

    function finalize() {
        if (seq !== trackRequestSeq) {
            return;
        }
        var tracks = [];
        var originalTotal = 0;
        for (var k = 0; k < ids.length; k++) {
            var id = ids[k];
            var device = deviceStore[id];
            var points = results[id] || [];
            if (!device || points.length < 2) {
                continue;
            }
            originalTotal += points.length;
            tracks.push({
                id: id,
                name: device.name,
                points: points,
                iconInfo: deviceIconInfo(device),
                color: trackColorFor(id)
            });
        }
        if (!tracks.length) {
            setTrackHint(t("noTrackData"), true);
            ysToast(t("noTrackData"), true);
            trackVisible = false;
            $("#btnQuery").text(t("trackShow"));
            $("#playbackActions").attr("hidden", "hidden");
            resetPlaybackUi();
            return;
        }
        map.queryMulti(tracks, true);
        map.setTrackSpeed(trackSpeedMultiplier);
        trackVisible = true;
        trackedDeviceIds = ids.slice();
        trackedDeviceId = ids[0] || null;
        activeDeviceId = trackedDeviceId;
        $("#btnQuery").text(t("trackHide"));
        $("#playbackActions").removeAttr("hidden");
        $("#seekField").removeAttr("hidden");
        resetPlaybackUi();
        map.seek(0);
        var info = map.getTrackInfo ? map.getTrackInfo() : null;
        lastTrackDuration = info && info.durationSec ? info.durationSec : 0;
        lastTrackOriginalCount = originalTotal;
        lastTrackDrawnCount = info ? info.drawn : originalTotal;
        updateTrackHintText();
        renderTrackDeviceList();
        renderDeviceList();
        updatePanelCompact();
        SaveState();
    }

    for (var j = 0; j < ids.length; j++) {
        (function (entityId) {
            getLocationData(entityId, function (points) {
                results[entityId] = points || [];
                pending--;
                if (pending === 0) {
                    finalize();
                }
            });
        })(ids[j]);
    }
}

function setTrackSpeed(multiplier) {
    var m = parseFloat(multiplier);
    if (!isFinite(m) || m <= 0) {
        m = 1;
    }
    trackSpeedMultiplier = m;
    map.setTrackSpeed(m);
    $("#trackSpeed [data-speed]").removeClass("is-active")
        .filter('[data-speed="' + m + '"]').addClass("is-active");
    SaveState();
    if (trackVisible) {
        updateTrackHintText();
    }
}

function updateTrackHintText() {
    if (!trackVisible || !trackedDeviceIds.length) {
        return;
    }
    var names = [];
    for (var i = 0; i < trackedDeviceIds.length; i++) {
        var device = deviceStore[trackedDeviceIds[i]];
        if (device) {
            names.push(device.name);
        }
    }
    var rangeLabel = trackRangeMode === "date" ? "自定义时间" : getTrackRange().label;
    var hint = "已加载 " + trackedDeviceIds.length + " 个设备的轨迹（" + rangeLabel + "）";
    if (names.length === 1) {
        hint = "已加载「" + names[0] + "」的轨迹（" + rangeLabel + "）";
    } else if (names.length > 1) {
        hint += "（" + names.slice(0, 3).join("、") + (names.length > 3 ? " 等" : "") + "）";
    }
    hint += "，共 " + lastTrackOriginalCount + " 个点";
    if (lastTrackDrawnCount > 0 && lastTrackDrawnCount < lastTrackOriginalCount) {
        hint += "（已抽样绘制 " + lastTrackDrawnCount + " 个点以保证流畅）";
    }
    var duration = map.getTrackDuration ? map.getTrackDuration() : lastTrackDuration;
    if (duration > 0) {
        hint += " · 动画约 " + Math.round(duration) + " 秒（" + trackSpeedMultiplier + "×）";
    }
    setTrackHint(hint);
}

function hideTrack() {
    trackRequestSeq++; /* 取消仍在加载中的轨迹请求 */
    map.DrawStop();
    map.query(null, false);
    trackVisible = false;
    trackedDeviceId = null;
    trackedDeviceIds = [];
    resetPlaybackUi();
    $("#btnQuery").text(t("trackShow"));
    $("#playbackActions").attr("hidden", "hidden");
    $("#seekField").attr("hidden", "hidden");
    $("#seekPosLabel").text("--");
    $("#trackSeek").val("0");
    updateRangeFill(document.getElementById("trackSeek"));
    setTrackHint("");
    renderTrackDeviceList();
    updatePanelCompact();
    SaveState();
}

function getLocationData(entityId, callback) {
    var range = getTimeRange();
    var arr = [];

    /* 优先用 HA 会话的 WebSocket 取历史（无需长期令牌） */
    if (dataSource === "hass" && parentHass) {
        fetchHistoryWs([entityId], range.from, range.to, function (result) {
            var list = result && result[entityId] ? result[entityId] : [];
            for (var i = 0; i < list.length; i++) {
                var point = historyStateToPoint(list[i]);
                if (point) {
                    arr.push(point);
                }
            }
            callback(arr);
        });
        return;
    }

    var strFrom = getStandardDatetime(range.from);
    var strTo = getStandardDatetime(range.to);
    var url = HomeAssistantWebAPIUrl + "/api/history/period/" + strFrom +
        "?end_time=" + strTo + "&filter_entity_id=" + encodeURIComponent(entityId);

    $.ajax({
        type: "GET",
        url: url,
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: true,
        dataType: "json",
        success: function (data) {
            if (data && data.length && data[0]) {
                $.each(data[0], function (i, n) {
                    var point = historyStateToPoint(n);
                    if (point) {
                        arr.push(point);
                    }
                });
            }
            callback(arr);
        },
        error: function () {
            callback(arr);
        }
    });
}

/* ================= 回家路线 ================= */

function renderRouteList() {
    var container = document.getElementById("routeDeviceList");
    var html = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var d = deviceStore[deviceOrder[i]];
        if (!d || !hasPosition(d)) {
            continue;
        }
        var checked = !!routeSelected[d.id];
        var checkbox = '<input class="ys-route-check" type="checkbox" value="' +
            escapeHtml(d.id) + '"' + (checked ? " checked" : "") +
            ' aria-label="选择 ' + escapeHtml(d.name) + '">';
        html.push('<label class="ys-device-row ys-route-row' + (checked ? " is-active" : "") +
            '" data-id="' + escapeHtml(d.id) + '">' +
            deviceAvatarHtml(d) + deviceInfoHtml(d) + checkbox + '</label>');
    }
    container.innerHTML = html.length ? html.join("") : '<div class="ys-hint">暂无可选设备</div>';
    updateRouteHint();
}

function updateRouteHint() {
    var capability = getAmapCapability();
    if (!capability.ok) {
        $("#routeHint").text(capability.reason);
        return;
    }
    if (!backhomeTrackEnabled) {
        $("#routeHint").text("");
        return;
    }
    var count = 0;
    for (var id in routeSelected) {
        if (routeSelected[id]) {
            count++;
        }
    }
    $("#routeHint").text("已显示 " + count + " 个设备的回家路线");
}

/** 关闭回家路线显示（轨迹与回家路线同一时间只显示一种） */
function turnOffBackhomeRoutes() {
    if (!backhomeTrackEnabled) {
        return;
    }
    backhomeTrackEnabled = false;
    $("#btnBackhome").text(t("backShow"));
    map.drawdrivingmarkerShow(false);
    $("#routeHint").text("");
    SaveState();
}

/** 根据高德 Key/jscode 是否配置，更新回家路线按钮状态 */
function updateAmapCapabilityUi() {
    var capability = getAmapCapability();
    var btn = document.getElementById("btnBackhome");
    if (btn) {
        if (capability.ok) {
            $(btn).prop("disabled", false).removeClass("is-disabled").removeAttr("title");
        } else {
            $(btn).prop("disabled", true).addClass("is-disabled").attr("title", capability.reason);
        }
    }
    var hint = document.getElementById("routeHint");
    if (hint && !capability.ok && !backhomeTrackEnabled) {
        hint.textContent = capability.reason;
    }
}

function onBackhomeButtonClick() {
    var capability = getAmapCapability();
    if (!capability.ok) {
        ysToast(capability.reason, true);
        var routeHint = document.getElementById("routeHint");
        if (routeHint) {
            routeHint.textContent = capability.reason;
        }
        return;
    }
    if (!backhomeTrackEnabled) {
        if (trackVisible) {
            hideTrack();
        }
        var ids = [];
        for (var id in routeSelected) {
            if (routeSelected[id] && deviceStore[id] && hasPosition(deviceStore[id])) {
                ids.push(id);
            }
        }
        if (!ids.length) {
            $("#routeHint").text("请先勾选需要显示回家路线的设备");
            ysToast(t("noCheckedDevices"), true);
            switchTab("route");
            return;
        }
        backhomeTrackEnabled = true;
        $("#btnBackhome").text(t("backHide"));
        drawBackhomeRoutes();
        SaveState();
    } else {
        backhomeTrackEnabled = false;
        $("#btnBackhome").text(t("backShow"));
        map.drawdrivingmarkerShow(false);
        $("#routeHint").text("");
        SaveState();
    }
}

function drawBackhomeRoutes() {
    if (!backhomeTrackEnabled) {
        return;
    }
    for (var i = 0; i < deviceOrder.length; i++) {
        var d = deviceStore[deviceOrder[i]];
        if (d && routeSelected[d.id] && hasPosition(d)) {
            drawDrivingMarkerWithLimit(d.id, homePoint, backhomeTrackType);
        }
    }
    updateRouteHint();
}

let drawCount = 0;
let lastCallTime = 0;

function drawDrivingMarkerWithLimit(deviceId, homePoint, backhomeTrackType) {
    const currentTime = Date.now();
    if (currentTime - lastCallTime >= 1000) {
        drawCount = 0;
        lastCallTime = currentTime;
    }
    if (drawCount < 2) {
        map.drawdrivingmarker(deviceId, homePoint, backhomeTrackType);
        drawCount++;
    } else {
        setTimeout(function () {
            map.drawdrivingmarker(deviceId, homePoint, backhomeTrackType);
        }, 1000 - (currentTime - lastCallTime));
        drawCount = 0;
        lastCallTime = Date.now();
    }
}

/* ================= 地图事件 ================= */

$(document).on("mapInitFinished", function () {
    mapInitialized = true;
    if (window.__yunshangMapReadyTimer) {
        clearTimeout(window.__yunshangMapReadyTimer);
        window.__yunshangMapReadyTimer = null;
    }
    hideMapLoading();
    applyMapTheme();
    syncToolbarState(["traffic", "homepoint", "homerange", "devicelist"]);
    syncBasemapSelect();
    refreshDevices(false);
    if (pollTimer) {
        clearInterval(pollTimer);
    }
    pollTimer = setInterval(function () {
        refreshDevices(false);
    }, 10000);
});

$(document).on("themechange", function () {
    applyMapTheme();
});

$(document).on("trackAnimationEnd", function () {
    if (trackVisible) {
        playbackState = "finished";
        updatePlaybackUi();
        var seek = document.getElementById("trackSeek");
        if (seek && !seekDragging) {
            seek.value = "1000";
            updateRangeFill(seek);
        }
    }
});

$(document).on("trackProgress", function (event, info) {
    if (!trackVisible || !info) {
        return;
    }
    updateSeekUi(info);
});

$(document).on("mapRebuilt", function () {
    if (trackVisible) {
        map.seek(0);
    }
});

$(document).on("updateDrivingTime", function (event, params) {
    if (!params || !params.deviceId) {
        return;
    }
    var device = deviceStore[params.deviceId];
    if (!device) {
        return;
    }
    device.travel_time = isNaN(params.time) ? params.time : formatSeconds(params.time);
    renderDeviceList();
});

$(document).on("updateDrivingState", function (event, params) {
    if (!params || !params.deviceId) {
        return;
    }
    var device = deviceStore[params.deviceId];
    if (!device) {
        return;
    }
    var state = params.state;
    if (state === "home" || state === "Home") {
        device.state = t("stateHome");
        device.state_label = t("stateHome");
        device.state_cls = "home";
        device.state_r = "home";
    } else {
        device.state = state;
        device.state_label = state;
        device.state_cls = "zone";
        device.state_r = state;
    }
    renderDeviceList();
});

function applyMapTheme() {
    if (!mapInitialized) {
        return;
    }
    var resolved = (window.YunshangTheme ? YunshangTheme.resolve() : "light");
    map.setMapStyle(resolved === "dark" ? "amap://styles/dark" : "amap://styles/normal");
}

/* ================= 工具栏 ================= */

var toolbarIconCache = {};

function syncToolbarState(ids) {
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var enabled = false;
        try {
            enabled = map["is" + id]();
        } catch (e) {
            enabled = false;
        }
        var src = "images/toolbar_" + id + (enabled ? "_enable.png" : "_disable.png");
        if (toolbarIconCache[id] === src) {
            continue;
        }
        var img = document.getElementById("toolbar_" + id);
        if (img) {
            toolbarIconCache[id] = src;
            img.setAttribute("src", src);
        }
    }
}

/* ================= 数据读取 ================= */

function loadHomePoint(callback) {
    haFetchHome(function (home) {
        homePoint = home;
        if (callback) {
            callback();
        }
    });
}

function loadZones(arrZone, callback) {
    haFetchStates(function (states) {
        if (states) {
            $.each(states, function (i, n) {
                if (n.entity_id && n.entity_id.indexOf("zone.") === 0 &&
                    n.attributes &&
                    n.attributes["longitude"] != undefined && n.attributes["latitude"] != null) {
                    arrZone.push({
                        longitude: n.attributes["longitude"],
                        latitude: n.attributes["latitude"],
                        friendly_name: n.attributes["friendly_name"],
                        entity_id: n.entity_id,
                        radius: n.attributes["radius"]
                    });
                }
            });
        }
        if (callback) {
            callback();
        }
    });
}

/* ================= 底图切换 ================= */

function initBasemapSelect() {
    var select = document.getElementById("basemapSelect");
    if (!select || !map.getBasemapOptions) {
        return;
    }
    var options = map.getBasemapOptions();
    var html = [];
    for (var i = 0; i < options.length; i++) {
        html.push('<option value="' + options[i].id + '">' + options[i].label + '</option>');
    }
    select.innerHTML = html.join("");
    syncBasemapSelect();
}

function syncBasemapSelect() {
    var select = document.getElementById("basemapSelect");
    if (!select) {
        return;
    }
    var current = null;
    if (map.getBasemap) {
        current = map.getBasemap();
    }
    if (!current) {
        try {
            current = window.localStorage.getItem("yunshang_map_basemap");
        } catch (e) {
            current = null;
        }
    }
    if (current) {
        select.value = current;
    }
}

/* ================= 多设备历史轨迹（卡片模式） ================= */

function startHistoryPolling() {
    if (!embedMode || !hoursToShow || historyStarted) {
        return;
    }
    historyStarted = true;
    fetchHistoryPaths();
    if (historyTimer) {
        clearInterval(historyTimer);
    }
    historyTimer = setInterval(fetchHistoryPaths, 60000);
}

function fetchHistoryPaths() {
    if (!embedMode || !hoursToShow || !deviceOrder.length) {
        return;
    }
    var end = new Date();
    var start = new Date(end.getTime() - hoursToShow * 3600 * 1000);
    var entities = deviceOrder.slice();
    var paths = [];

    function appendPath(index, entityId, points) {
        if (!points || points.length < 2) {
            return;
        }
        var maxPoints = 240;
        if (points.length > maxPoints) {
            var step = Math.ceil(points.length / maxPoints);
            var sampled = [];
            for (var k = 0; k < points.length; k += step) {
                sampled.push(points[k]);
            }
            sampled.push(points[points.length - 1]);
            points = sampled;
        }
        var device = deviceStore[entityId] || {};
        paths.push({
            id: entityId,
            name: device.name || entityId,
            color: DEVICE_COLORS[index % DEVICE_COLORS.length],
            points: points
        });
    }

    function finishIfDone(pending) {
        if (pending === 0 && map.setHistoryPaths) {
            map.setHistoryPaths(paths);
            historyLoaded = true;
        }
    }

    /* 优先用 HA 会话的 WebSocket 一次取回所有实体历史 */
    if (dataSource === "hass" && parentHass) {
        fetchHistoryWs(entities, start, end, function (result) {
            if (!result) {
                return;
            }
            for (var i = 0; i < entities.length; i++) {
                var entityId = entities[i];
                var list = result[entityId] || [];
                var points = [];
                for (var j = 0; j < list.length; j++) {
                    var point = historyStateToPoint(list[j]);
                    if (point) {
                        points.push({ lon: point.longitude, lat: point.latitude, time: getDatetime(point.last_updated) });
                    }
                }
                appendPath(i, entityId, points);
            }
            finishIfDone(0);
        });
        return;
    }

    var from = getStandardDatetime(start);
    var to = getStandardDatetime(end);
    var pending = entities.length;

    for (var i = 0; i < entities.length; i++) {
        (function (index) {
            var entityId = entities[index];
            var url = HomeAssistantWebAPIUrl + "/api/history/period/" + from +
                "?end_time=" + to + "&filter_entity_id=" + encodeURIComponent(entityId);
            $.ajax({
                type: "GET",
                url: url,
                beforeSend: function (request) {
                    request.setRequestHeader("x-ha-access", authToken);
                    request.setRequestHeader("Authorization", newToken);
                },
                cache: false,
                async: true,
                dataType: "json",
                success: function (data) {
                    var points = [];
                    if (data && data.length && data[0]) {
                        for (var j = 0; j < data[0].length; j++) {
                            var n = data[0][j];
                            var point = historyStateToPoint(n);
                            if (point) {
                                points.push({ lon: point.longitude, lat: point.latitude, time: getDatetime(point.last_updated) });
                            }
                        }
                        appendPath(index, entityId, points);
                    }
                    pending--;
                    finishIfDone(pending);
                },
                error: function () {
                    pending--;
                    finishIfDone(pending);
                }
            });
        })(i);
    }
}

/* ================= 本地存储 ================= */

function SaveState() {
    var selected = [];
    for (var id in routeSelected) {
        if (routeSelected[id]) {
            selected.push(id);
        }
    }
    var hidden = [];
    for (var hid in hiddenIds) {
        if (hiddenIds[hid]) {
            hidden.push(hid);
        }
    }
    var state = {
        backhomeMode: backhomeTrackType,
        activeDevice: activeDeviceId,
        followDevice: followDeviceId,
        routeSelected: selected,
        hidden: hidden,
        tab: activeTab,
        trackSpeed: trackSpeedMultiplier,
        trackSelected: trackSelectedOrder.slice(),
        trackRange: trackRangeIndex,
        trackRangeMode: trackRangeMode,
        trackDateFrom: (document.getElementById("trackDateFrom") || {}).value || "",
        trackDateTo: (document.getElementById("trackDateTo") || {}).value || ""
    };
    try {
        storage.setItem(STORAGE_STATE, JSON.stringify(state));
    } catch (e) {
        /* 忽略 */
    }
}

function loadState() {
    var state = null;
    try {
        state = JSON.parse(storage.getItem(STORAGE_STATE) || "null");
    } catch (e) {
        state = null;
    }
    if (!state) {
        return;
    }
    backhomeTrackType = state.backhomeMode || "drive";
    activeDeviceId = state.activeDevice || null;
    followDeviceId = state.followDevice || null;
    activeTab = state.tab || "devices";
    trackSpeedMultiplier = state.trackSpeed || 1;
    if (typeof state.trackRange === "number" && state.trackRange >= 0 && state.trackRange < TRACK_RANGES.length) {
        trackRangeIndex = state.trackRange;
    }
    trackRangeMode = state.trackRangeMode === "date" ? "date" : "slider";
    var fromEl = document.getElementById("trackDateFrom");
    var toEl = document.getElementById("trackDateTo");
    if (fromEl && state.trackDateFrom) {
        fromEl.value = state.trackDateFrom;
    }
    if (toEl && state.trackDateTo) {
        toEl.value = state.trackDateTo;
    }
    if ($.isArray(state.routeSelected)) {
        for (var i = 0; i < state.routeSelected.length; i++) {
            routeSelected[state.routeSelected[i]] = true;
        }
    }
    if ($.isArray(state.hidden)) {
        for (var j = 0; j < state.hidden.length; j++) {
            hiddenIds[state.hidden[j]] = 1;
        }
    }
    trackSelected = {};
    trackSelectedOrder = [];
    if ($.isArray(state.trackSelected)) {
        for (var k = 0; k < state.trackSelected.length; k++) {
            trackSelected[state.trackSelected[k]] = true;
            trackSelectedOrder.push(state.trackSelected[k]);
        }
    }
    $("#backhomeMode button").removeClass("is-active")
        .filter('[data-mode="' + backhomeTrackType + '"]').addClass("is-active");
    $("#trackSpeed [data-speed]").removeClass("is-active")
        .filter('[data-speed="' + trackSpeedMultiplier + '"]').addClass("is-active");
    $("#trackRange").val(String(trackRangeIndex));
    updateTrackRangeLabel();
}
