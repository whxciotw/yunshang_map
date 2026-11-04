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
var trackedDeviceId = null;  // 当前显示轨迹的设备
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
    if (!authToken && !newToken) {
        showMapError(t("tokenMissing"), t("tokenMissingDetail"));
        return;
    }

    initStaticUi();
    loadState();
    setTimeRangeToToday();
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

    /* 轨迹页签 */
    $("#queryTimeFrom, #queryTimeTo").on("change", function () {
        validTimeRange(true);
    });
    $(document).on("click", ".ys-chip[data-range]", function () {
        applyTimeRangePreset($(this).attr("data-range"));
        $(".ys-chip[data-range]").removeClass("is-active");
        $(this).addClass("is-active");
    });
    $("#btnQuery").on("click", onTrackButtonClick);
    $(document).on("click", "#trackDeviceList .ys-device-row", function () {
        var id = $(this).attr("data-id");
        if (!id) {
            return;
        }
        selectDevice(id, true);
        if (trackVisible) {
            loadTrack(id);
        }
    });
    $(document).on("click", "#trackSpeed [data-speed]", function () {
        setTrackSpeed(parseFloat($(this).attr("data-speed")));
    });
    $("#btnDrawStart").on("click", function () {
        map.DrawStart();
    });
    $("#btnDrawPause").on("click", function () {
        map.DrawPause();
    });
    $("#btnDrawResume").on("click", function () {
        map.DrawResume();
    });
    $("#btnDrawStop").on("click", function () {
        map.DrawStop();
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
    layoutPanel();
    requestAnimationFrame(function () {
        panel.classList.add("is-open");
    });
    syncToolbarState(["devicelist"]);
    renderDeviceList(true);
}

function closePanel() {
    var panel = document.getElementById("devicePanel");
    panelVisible = false;
    panel.classList.remove("is-open");
    setTimeout(function () {
        if (!panelVisible) {
            panel.hidden = true;
        }
    }, 200);
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
    if (tab === "track") {
        renderTrackDeviceList();
    } else if (tab === "route") {
        renderRouteList();
    }
}

function layoutPanel() {
    var panel = document.getElementById("devicePanel");
    var card = panel.querySelector(".ys-panel-card");
    if (!card) {
        return;
    }
    if (window.innerWidth <= 560) {
        card.style.width = "";
        card.style.height = "";
        card.style.left = "";
        card.style.top = "";
        card.style.transform = "none";
    }
}

function onViewportChange() {
    layoutPanel();
}

/* 桌面端拖动面板（移动端为底部抽屉，不拖动） */
function initPanelDrag() {
    var panel = document.getElementById("devicePanel");
    var card = panel.querySelector(".ys-panel-card");
    var header = document.getElementById("panelHeader");
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    header.addEventListener("pointerdown", function (event) {
        if (window.innerWidth <= 560) {
            return;
        }
        if ($(event.target).closest("button").length) {
            return;
        }
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        var rect = card.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        card.classList.add("is-dragging");
        try {
            header.setPointerCapture(event.pointerId);
        } catch (e) {
            /* 忽略 */
        }
    });

    header.addEventListener("pointermove", function (event) {
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
        if (!dragging) {
            return;
        }
        dragging = false;
        card.classList.remove("is-dragging");
    }
    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);
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
    updateTrackSelectSelection(deviceId);
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
        updateTrackSelectSelection(deviceId);
    }
    renderDeviceList(true);
    SaveState();
}

/* ================= 数据刷新 ================= */

function refreshDevices(showErrors) {
    if (document.hidden && !showErrors) {
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
        success: function (states) {
            handleStates(states);
        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {
            if (showErrors) {
                ysToast("刷新设备列表失败：" + (errorThrown || textStatus), true);
            }
        }
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
    /* 未选中设备时默认选中第一个有坐标的设备 */
    if (!activeDeviceId || !deviceStore[activeDeviceId]) {
        for (var di = 0; di < deviceOrder.length; di++) {
            if (hasPosition(deviceStore[deviceOrder[di]])) {
                activeDeviceId = deviceOrder[di];
                break;
            }
        }
    }
    var html = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var d = deviceStore[deviceOrder[i]];
        if (!d || !hasPosition(d)) {
            continue;
        }
        var active = (activeDeviceId === d.id) || (trackVisible && trackedDeviceId === d.id);
        var trailing = '<span class="ys-select-indicator' + (active ? " is-on" : "") +
            '" aria-hidden="true">' + ysIcon(active ? "radiobox-marked" : "radiobox-blank") + '</span>';
        html.push(deviceRowHtml(d, trailing, active ? "is-active" : ""));
    }
    container.innerHTML = html.length ? html.join("") : '<div class="ys-hint">暂无可选设备</div>';
}

function updateTrackSelectSelection(deviceId) {
    if (deviceId) {
        activeDeviceId = deviceId;
    }
    renderTrackDeviceList();
}

function getTimeRange() {
    return {
        from: document.getElementById("queryTimeFrom").value,
        to: document.getElementById("queryTimeTo").value
    };
}

function validTimeRange(notify) {
    var range = getTimeRange();
    if (!range.from || !range.to) {
        if (notify) {
            ysToast(t("invalidTimeRange"), true);
        }
        return false;
    }
    if (new Date(range.from).getTime() >= new Date(range.to).getTime()) {
        if (notify) {
            ysToast(t("invalidTimeRange"), true);
        }
        return false;
    }
    return true;
}

function fmtLocal(d) {
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

function setTimeRangeToToday() {
    var now = new Date();
    var from = new Date(now);
    from.setHours(0, 0, 0, 0);
    var to = new Date(now);
    to.setHours(23, 59, 0, 0);
    document.getElementById("queryTimeFrom").value = fmtLocal(from);
    document.getElementById("queryTimeTo").value = fmtLocal(to);
}

function applyTimeRangePreset(range) {
    var now = new Date();
    var from = new Date(now);
    var to = new Date(now);
    if (range === "today") {
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 0, 0);
    } else if (range === "yesterday") {
        from.setDate(now.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        to.setDate(now.getDate() - 1);
        to.setHours(23, 59, 0, 0);
    } else {
        from.setDate(now.getDate() - 6);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 0, 0);
    }
    document.getElementById("queryTimeFrom").value = fmtLocal(from);
    document.getElementById("queryTimeTo").value = fmtLocal(to);
}

function setTrackHint(text, isError) {
    var hint = document.getElementById("trackHint");
    hint.textContent = text || "";
    hint.classList.toggle("is-error", !!isError);
}

function onTrackButtonClick() {
    if (!trackVisible) {
        var id = activeDeviceId || trackedDeviceId;
        if (!id || !deviceStore[id]) {
            for (var fi = 0; fi < deviceOrder.length; fi++) {
                if (hasPosition(deviceStore[deviceOrder[fi]])) {
                    id = deviceOrder[fi];
                    break;
                }
            }
        }
        if (!id || !deviceStore[id]) {
            ysToast(t("noDeviceSelected"), true);
            switchTab("devices");
            return;
        }
        loadTrack(id);
    } else {
        hideTrack();
    }
}

var trackRequestSeq = 0;

function loadTrack(deviceId) {
    var device = deviceStore[deviceId];
    if (!device) {
        return;
    }
    if (!validTimeRange(true)) {
        return;
    }
    /* 切换设备时先隐藏旧轨迹 */
    if (trackVisible) {
        map.DrawStop();
        map.query(null, false);
        trackVisible = false;
    }
    setTrackHint(t("trackLoading"));
    var seq = ++trackRequestSeq;
    getLocationData(deviceId, function (points) {
        if (seq !== trackRequestSeq) {
            return; /* 已经切换到别的设备 */
        }
        if (!points || points.length === 0) {
            setTrackHint(t("noTrackData"), true);
            ysToast(t("noTrackData"), true);
            trackVisible = false;
            $("#btnQuery").text(t("trackShow"));
            $("#playbackActions").attr("hidden", "hidden");
            return;
        }
        trackedDeviceId = deviceId;
        trackVisible = true;
        map.query(points, true, deviceIconInfo(device));
        map.setTrackSpeed(trackSpeedMultiplier);
        $("#btnQuery").text(t("trackHide"));
        $("#playbackActions").removeAttr("hidden");
        updateTrackSelectSelection(deviceId);
        var info = map.getTrackInfo ? map.getTrackInfo() : null;
        if (info && info.durationSec) {
            lastTrackDuration = info.durationSec;
        }
        lastTrackOriginalCount = points.length;
        lastTrackDrawnCount = info ? info.drawn : points.length;
        updateTrackHintText(device);
        activeDeviceId = deviceId;
        renderDeviceList();
        SaveState();
    });
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
    if (trackVisible && trackedDeviceId && deviceStore[trackedDeviceId]) {
        updateTrackHintText(deviceStore[trackedDeviceId]);
    }
}

function updateTrackHintText(device) {
    var hint = "已加载「" + (device ? device.name : "") + "」的轨迹，共 " + lastTrackOriginalCount + " 个点";
    if (lastTrackDrawnCount > 0 && lastTrackDrawnCount < lastTrackOriginalCount) {
        hint += "（点较多，已抽样绘制 " + lastTrackDrawnCount + " 个点以保证流畅）";
    }
    var duration = map.getTrackDuration ? map.getTrackDuration() : lastTrackDuration;
    if (duration > 0) {
        hint += " · 动画约 " + Math.round(duration) + " 秒（" + trackSpeedMultiplier + "×）";
    }
    setTrackHint(hint);
}

function hideTrack() {
    map.DrawStop();
    map.query(null, false);
    trackVisible = false;
    trackedDeviceId = null;
    $("#btnQuery").text(t("trackShow"));
    $("#playbackActions").attr("hidden", "hidden");
    setTrackHint("");
    SaveState();
}

function getLocationData(entityId, callback) {
    var range = getTimeRange();
    var strFrom = getStandardDatetime(range.from);
    var strTo = getStandardDatetime(range.to);
    var url = HomeAssistantWebAPIUrl + "/api/history/period/" + strFrom +
        "?end_time=" + strTo + "&filter_entity_id=" + encodeURIComponent(entityId);

    var arr = [];
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
                    if (n.attributes &&
                        n.attributes["longitude"] !== null && n.attributes["longitude"] !== undefined &&
                        n.attributes["latitude"] !== null && n.attributes["latitude"] !== undefined &&
                        n.attributes["longitude"] !== "" && n.attributes["latitude"] !== "") {
                        arr.push({
                            longitude: n.attributes["longitude"],
                            latitude: n.attributes["latitude"],
                            lastseen: n.attributes["lastseen"],
                            latest_report_time: n.attributes["latest_report_time"],
                            last_updated: n.last_updated,
                            updatedate: (n.attributes["lastseen"] ? "最后出现：" + n.attributes["lastseen"] + "<br/>" : "") +
                                (n.attributes["latest_report_time"] ? "上报时间：" + n.attributes["latest_report_time"] + "<br/>记录时间：" : "") +
                                (getDatetime(n.last_updated) ? "" + getDatetime(n.last_updated) : ""),
                            lnglat: [n.attributes["longitude"], n.attributes["latitude"]]
                        });
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

function onBackhomeButtonClick() {
    if (!backhomeTrackEnabled) {
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
    $.ajax({
        type: "GET",
        url: HomeAssistantWebAPIUrl + "/api/config",
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: false,
        dataType: "json",
        success: function (data) {
            if (typeof data === "string") {
                data = $.parseJSON(data);
            }
            homePoint = { lon: data.longitude, lat: data.latitude };
        },
        error: function () {
            homePoint = null;
        }
    });
    if (callback) {
        callback();
    }
}

function loadZones(arrZone, callback) {
    $.ajax({
        type: "GET",
        url: HomeAssistantWebAPIUrl + "/api/states",
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: false,
        dataType: "json",
        success: function (data) {
            if (!data) {
                return;
            }
            $.each(data, function (i, n) {
                if (n.entity_id && n.entity_id.indexOf("zone.") === 0 &&
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
    });
    if (callback) {
        callback();
    }
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
    var from = getStandardDatetime(start);
    var to = getStandardDatetime(end);
    var entities = deviceOrder.slice();
    var pending = entities.length;
    var paths = [];

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
                    if (data && data.length && data[0]) {
                        var points = [];
                        for (var j = 0; j < data[0].length; j++) {
                            var n = data[0][j];
                            if (!n.attributes) {
                                continue;
                            }
                            var lon = n.attributes.longitude;
                            var lat = n.attributes.latitude;
                            if (lon === undefined || lon === null || lat === undefined || lat === null) {
                                continue;
                            }
                            points.push({ lon: lon, lat: lat, time: getDatetime(n.last_updated) });
                        }
                        if (points.length > 1) {
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
                    }
                    pending--;
                    if (pending === 0 && map.setHistoryPaths) {
                        map.setHistoryPaths(paths);
                        historyLoaded = true;
                    }
                },
                error: function () {
                    pending--;
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
        trackSpeed: trackSpeedMultiplier
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
    $("#backhomeMode button").removeClass("is-active")
        .filter('[data-mode="' + backhomeTrackType + '"]').addClass("is-active");
    $("#trackSpeed [data-speed]").removeClass("is-active")
        .filter('[data-speed="' + trackSpeedMultiplier + '"]').addClass("is-active");
}
