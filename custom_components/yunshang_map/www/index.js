/**
 * 云尚（高德）地图 - 主页面逻辑
 */
var map = new Map();
var homePoint = null;
var backhomeTrackEnabled = false;
var backhomeTrackType = null;
var getDataMode = null; // 'client','server'
var url = null;
var storage = null;
var authToken = null;
var newTokens = null;
var newToken = null;

/* 设备列表数据（以设备 ID 为键，保证刷新时状态可恢复） */
var deviceStore = {};
var deviceOrder = [];
var searchKeyword = "";
var selectedDeviceId = null;
var isRendering = false;
var devicePollTimer = null;
var mapInitialized = false;
var currentTrackDeviceId = null;

var THEME_STORAGE_KEY = "yunshang_map_theme";

$(function () {
    storage = window.localStorage;

    try {
        authToken = storage.getItem("authToken"); // 旧版模式
        newTokens = JSON.parse(storage.getItem("tokens")); // 新版 HA:0.76~0.77.1
    } catch (ex) {
        authToken = null;
        newTokens = null;
    }

    if (LongTimeToken != "") { // config.js 中配置的长期令牌
        newToken = LongTimeToken;
    } else {
        if (newTokens == null) {
            try {
                newTokens = JSON.parse(storage.getItem("hassTokens")); // 新版 0.77.2
            } catch (ex) {
                newTokens = null;
            }
        }
        if (newTokens != null) {
            newToken = newTokens.token_type + " " + newTokens.access_token;
        }
    }

    if (authToken == null && newToken == null) {
        showMapError(t("tokenMissing"), t("tokenMissingDetail"));
        return;
    }

    getDataMode = "client"; // 不再使用 server 模式

    /* —— 初始化面板文案 —— */
    $('#deviceSearch').attr('placeholder', t("searchPlaceholder"));
    $('#btnDeviceRefresh').text(t("refresh"));
    $('#deviceEmpty').text(t("noDevices"));

    $('#btnDrawStart').linkbutton({ text: TXT.drawStart });
    $('#btnDrawPause').linkbutton({ text: TXT.drawPause });
    $('#btnDrawResume').linkbutton({ text: TXT.drawResume });
    $('#btnDrawStop').linkbutton({ text: TXT.drawStop });
    $('#btnQuery').linkbutton({ text: TXT.trackShow });
    $('#btnBackhome').linkbutton({ text: TXT.backShow });

    setTimeRangeToToday();

    /* —— 回家路线的方式：驾车 / 骑行 / 步行 —— */
    var backhomeType = [];
    backhomeType.push({ "text": TXT.backDrive, "id": "drive" });
    backhomeType.push({ "text": TXT.backRide, "id": "ride" });
    backhomeType.push({ "text": TXT.backWalk, "id": "walk" });
    $("#cbBackhome").combobox("loadData", backhomeType);

    let isComboboxEnabled = true;
    $("#cbBackhome").combobox({
        onChange: function (n, o) {
            if (!isComboboxEnabled) {
                return;
            }
            isComboboxEnabled = false;
            $("#cbBackhome").combobox('disable');
            setTimeout(() => {
                isComboboxEnabled = true;
                $("#cbBackhome").combobox('enable');
            }, 2000);

            backhomeTrackType = n;
            if (backhomeTrackEnabled == true) {
                var checked = getCheckedIds();
                for (var i = 0; i < checked.length; i++) {
                    map.showdevicemarker(checked[i], true);
                    drawDrivingMarkerWithLimit(checked[i], homePoint, backhomeTrackType);
                }
            }
            SaveStorage();
        }
    });

    LoadStorage();
    trackBtnShow();

    if ($("#cbBackhome").combobox("getValue") == "") {
        var cbBackhomedata = $('#cbBackhome').combobox('getData');
        if (cbBackhomedata && cbBackhomedata.length) {
            $('#cbBackhome').combobox('select', cbBackhomedata[0].id);
        }
    }

    initDeviceGrid();

    /* —— 读取 Home Assistant 配置（家的位置） —— */
    loadHomePoint(function () {
        var arrZone = [];
        loadZones(arrZone, function () {
            if (homePoint == null) {
                homePoint = { 'lon': 116.397428, 'lat': 39.90923 };
            }
            try {
                if (typeof AMap === "undefined" || typeof AMapUI === "undefined") {
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

    /* —— 底部工具栏 —— */
    $("#toolbar_zoomin").click(function () {
        map.zoomin();
        syncToolbarState(['zoomin', 'zoomout']);
    });
    $("#toolbar_zoomout").click(function () {
        map.zoomout();
        syncToolbarState(['zoomin', 'zoomout']);
    });
    $("#toolbar_traffic").click(function () {
        map.traffic();
        syncToolbarState(['traffic']);
    });
    $("#toolbar_homepoint").click(function () {
        map.homepoint();
        syncToolbarState(['homepoint']);
    });
    $("#toolbar_homerange").click(function () {
        map.homerange();
        syncToolbarState(['homerange']);
    });
    $("#toolbar_devicelist").click(function () {
        toggleDevicePanel();
    });

    /* —— 搜索 & 刷新 —— */
    var searchTimer = null;
    $("#deviceSearch").on("input", function () {
        var value = $(this).val() || "";
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            searchKeyword = value.trim().toLowerCase();
            renderDeviceList();
        }, 150);
    });

    $("#btnDeviceRefresh").on("click", function () {
        $(this).prop("disabled", true);
        refreshDevices(true);
        setTimeout(function () {
            $("#btnDeviceRefresh").prop("disabled", false);
        }, 800);
    });

    /* —— 轨迹 / 回家路线 / 动画按钮 —— */
    $('#btnQuery').bind('click', onTrackButtonClick);
    $('#btnBackhome').bind('click', onBackhomeButtonClick);

    $('#btnDrawStart').bind('click', function () {
        map.DrawStart();
    });
    $('#btnDrawPause').bind('click', function () {
        map.DrawPause();
    });
    $('#btnDrawResume').bind('click', function () {
        map.DrawResume();
    });
    $('#btnDrawStop').bind('click', function () {
        map.DrawStop();
    });

    /* —— 时间快捷区间 —— */
    $(".ys-chip[data-range]").on("click", function () {
        var range = $(this).attr("data-range");
        applyTimeRangePreset(range);
        $(".ys-chip[data-range]").removeClass("active");
        $(this).addClass("active");
    });

    /* —— 面板尺寸自适应 —— */
    var resizeTimer = null;
    $(window).on("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if ($('#deviceListWin').is(":visible")) {
                layoutDevicePanel();
            }
        }, 120);
    });

    $(document).on("keydown", function (event) {
        if (event.key === "Escape" && $('#deviceListWin').is(":visible")) {
            $('#deviceListWin').window('close');
            syncToolbarState(['devicelist']);
        }
    });

    var mapReadyTimer = setTimeout(function () {
        if (!mapInitialized) {
            showMapError(t("mapLoadFailed"), t("mapLoadFailedDetail"));
        }
    }, 18000);
    window.__yunshangMapReadyTimer = mapReadyTimer;

    if (YunshangTheme) {
        YunshangTheme.apply();
    }
});

/* ================= 主题 ================= */

function applyMapTheme() {
    if (!mapInitialized) {
        return;
    }
    var resolved = (window.YunshangTheme ? YunshangTheme.resolve() : "light");
    map.setMapStyle(resolved === "dark" ? "amap://styles/dark" : "amap://styles/normal");
}

$(document).on("themechange", function () {
    applyMapTheme();
});

/* ================= 地图初始化完成 ================= */

$(document).on("mapInitFinished", function () {
    mapInitialized = true;
    if (window.__yunshangMapReadyTimer) {
        clearTimeout(window.__yunshangMapReadyTimer);
        window.__yunshangMapReadyTimer = null;
    }
    hideMapLoading();
    applyMapTheme();
    syncToolbarState(['zoomin', 'zoomout', 'traffic', 'homepoint', 'homerange', 'devicelist']);
    layoutDevicePanelSilently();

    refreshDevices(false);
    if (devicePollTimer) {
        clearInterval(devicePollTimer);
    }
    devicePollTimer = setInterval(function () {
        refreshDevices(false);
    }, 10000);
});

$(document).on("zoomchange", function () {
    syncToolbarState(['zoomin', 'zoomout']);
});

/* ================= 设备列表 ================= */

function initDeviceGrid() {
    $("#deviceListGrid").datagrid({
        idField: 'id',
        fit: true,
        border: false,
        rownumbers: false,
        singleSelect: true,
        selectOnCheck: false,
        checkOnSelect: false,
        showHeader: true,
        rowHeight: 44,
        emptyMsg: t("noDevices"),
        onClickRow: function (rowIndex, rowData) {
            selectedDeviceId = rowData.id;
            if (!rowData.lon || !rowData.lat) {
                return;
            }
            map.center({
                'lon': rowData.lon,
                'lat': rowData.lat
            });
        },
        onDblClickRow: function (rowIndex, rowData) {
            openMoreInfo('device_tracker.' + rowData.id);
        },
        onCheck: function (rowIndex, rowData) {
            setDeviceChecked(rowData.id, true);
        },
        onUncheck: function (rowIndex, rowData) {
            setDeviceChecked(rowData.id, false);
        },
        onCheckAll: function (rows) {
            for (var i = 0; i < rows.length; i++) {
                setDeviceChecked(rows[i].id, true);
            }
        },
        onUncheckAll: function (rows) {
            for (var i = 0; i < rows.length; i++) {
                setDeviceChecked(rows[i].id, false);
            }
        }
    });
}

function setDeviceChecked(deviceId, checked) {
    var row = deviceStore[deviceId];
    if (row) {
        row.checked = !!checked;
    }
    if (isRendering || !mapInitialized) {
        return;
    }
    map.showdevicemarker(deviceId, !!checked);
    if (checked) {
        if (backhomeTrackEnabled == true && homePoint) {
            drawDrivingMarkerWithLimit(deviceId, homePoint, backhomeTrackType);
        }
    } else if (backhomeTrackEnabled == true) {
        map.cleardrivingmarker(deviceId);
    }
}

function getCheckedIds() {
    var ids = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var row = deviceStore[deviceOrder[i]];
        if (row && row.checked) {
            ids.push(row.id);
        }
    }
    return ids;
}

function isRowVisible(row) {
    if (!searchKeyword) {
        return true;
    }
    var name = (row.name || "").toLowerCase();
    var id = (row.id || "").toLowerCase();
    return name.indexOf(searchKeyword) >= 0 || id.indexOf(searchKeyword) >= 0;
}

function visibleRows() {
    var rows = [];
    for (var i = 0; i < deviceOrder.length; i++) {
        var row = deviceStore[deviceOrder[i]];
        if (row && isRowVisible(row)) {
            rows.push(row);
        }
    }
    return rows;
}

/** 完整重绘设备列表（保留勾选与选中状态） */
function renderDeviceList() {
    var rows = visibleRows();
    isRendering = true;
    try {
        $("#deviceListGrid").datagrid('loadData', rows);
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].checked) {
                $("#deviceListGrid").datagrid('checkRow', i);
            }
            if (selectedDeviceId && rows[i].id === selectedDeviceId) {
                $("#deviceListGrid").datagrid('selectRow', i);
            }
        }
    } finally {
        isRendering = false;
    }
    updateDevicePanelState(rows.length);
}

function syncDeviceToGrid(row) {
    if (!isRowVisible(row)) {
        return;
    }
    if (searchKeyword) {
        renderDeviceList();
        return;
    }
    var rows = $("#deviceListGrid").datagrid('getRows');
    var index = -1;
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === row.id) {
            index = i;
            break;
        }
    }
    isRendering = true;
    try {
        if (index >= 0) {
            $("#deviceListGrid").datagrid('updateRow', { index: index, row: row });
            if (selectedDeviceId === row.id) {
                $("#deviceListGrid").datagrid('selectRow', index);
            }
        } else {
            $("#deviceListGrid").datagrid('appendRow', row);
            index = $("#deviceListGrid").datagrid('getRows').length - 1;
            if (row.checked) {
                $("#deviceListGrid").datagrid('checkRow', index);
            }
        }
    } finally {
        isRendering = false;
    }
    updateDevicePanelState($("#deviceListGrid").datagrid('getRows').length);
}

function updateDevicePanelState(count) {
    var title = count > 0
        ? t("deviceListTitle") + "（" + count + "）"
        : t("deviceListTitle");
    try {
        $('#deviceListWin').window('setTitle', title);
    } catch (e) {
        /* 忽略 */
    }
    if (count > 0) {
        $("#deviceEmpty").attr("hidden", true);
    } else {
        $("#deviceEmpty").text(searchKeyword ? t("searchNoResult") : t("noDevices"));
        $("#deviceEmpty").removeAttr("hidden");
    }
}

/* ================= 设备数据刷新 ================= */

function refreshDevices(showErrors) {
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
        success: function (data) {
            handleStates(data);
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
    var idlist = (DeviceTrackerIDList || "").replace(/device_tracker\./g, "").split(",");
    idlist = idlist.filter(function (v) { return v !== ""; });

    var newDeviceIds = [];
    for (var index in states) {
        var stateObj = states[index];
        if (!stateObj || !stateObj.entity_id) {
            continue;
        }
        if (stateObj.entity_id.indexOf("device_tracker.") !== 0) {
            continue;
        }
        var attrs = stateObj.attributes || {};
        if (attrs.longitude === undefined || attrs.longitude === null || attrs.latitude === undefined || attrs.latitude === null) {
            continue;
        }
        var deviceId = stateObj.entity_id.replace("device_tracker.", "");
        if (idlist.length > 0 && idlist.indexOf(deviceId) === -1) {
            continue;
        }

        var row = ysBuildDeviceRow(deviceId, stateObj);
        var existing = deviceStore[deviceId];
        if (existing) {
            row.checked = existing.checked;
            row.travel_time = existing.travel_time || "";
            deviceStore[deviceId] = row;
        } else {
            row.checked = false;
            row.travel_time = "";
            deviceStore[deviceId] = row;
            deviceOrder.push(deviceId);
            newDeviceIds.push(deviceId);
        }

        map.drawdevicemarker(deviceId, row.name, { 'lon': row.lon, 'lat': row.lat }, {
            kind: row.icon_kind,
            picture: row.icon_picture,
            path: row.icon_path,
            key: row.icon_key
        }, { cls: row.state_cls });

        if (existing) {
            syncDeviceToGrid(row);
        }
    }

    for (var i = 0; i < newDeviceIds.length; i++) {
        syncDeviceToGrid(deviceStore[newDeviceIds[i]]);
    }

    if (!deviceOrder.length) {
        updateDevicePanelState(0);
        if (!refreshDevices.__emptyNotified) {
            refreshDevices.__emptyNotified = true;
            ysToast(t("noDevices"));
        }
    }
}

/* ================= 轨迹回放 ================= */

function getTimeRange() {
    var fromValue = $('#queryTimeFrom').datetimebox('getValue');
    var toValue = $('#queryTimeTo').datetimebox('getValue');
    return { from: fromValue, to: toValue };
}

function validTimeRange() {
    var range = getTimeRange();
    if (!range.from || !range.to) {
        ysToast(t("invalidTimeRange"), true);
        return false;
    }
    if (new Date(range.from.replace(/-/g, "/")).getTime() >= new Date(range.to.replace(/-/g, "/")).getTime()) {
        ysToast(t("invalidTimeRange"), true);
        return false;
    }
    return true;
}

function setTimeRangeToToday() {
    $('#queryTimeFrom').datetimebox('setValue', getCurrentDate() + " 00:00");
    $('#queryTimeTo').datetimebox('setValue', getCurrentDate() + " 23:59");
}

function applyTimeRangePreset(range) {
    var now = new Date();
    var from = new Date();
    var to = new Date();
    var fmt = function (d) { return getDatetime(d).slice(0, 16); };

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
    $('#queryTimeFrom').datetimebox('setValue', fmt(from));
    $('#queryTimeTo').datetimebox('setValue', fmt(to));
}

function onTrackButtonClick() {
    var currentText = $("#btnQuery").linkbutton("options").text;
    if (currentText == TXT.trackShow) {
        var row = $('#deviceListGrid').datagrid('getSelected');
        if (row == undefined) {
            ysToast(t("noDeviceSelected"), true);
            return;
        }
        if (!validTimeRange()) {
            return;
        }
        $('#btnQuery').linkbutton({ text: TXT.trackHide });
        ysToast(t("trackLoading"));
        var arr = getLocationData(row["id"]);
        if (!arr || arr.length === 0) {
            ysToast(t("noTrackData"), true);
            $('#btnQuery').linkbutton({ text: TXT.trackShow });
            trackBtnShow();
            return;
        }
        currentTrackDeviceId = row["id"];
        map.query(arr, true);
        trackBtnShow();
    } else {
        map.DrawStop();
        map.query(null, false);
        currentTrackDeviceId = null;
        $('#btnQuery').linkbutton({ text: TXT.trackShow });
        trackBtnShow();
    }
    SaveStorage();
}

function getLocationData(deviceId) {
    var str_deviceid = "device_tracker." + deviceId;
    var str_queryTimeFrom = getStandardDatetime($('#queryTimeFrom').datetimebox('getValue'));
    var str_queryTimeTo = getStandardDatetime($('#queryTimeTo').datetimebox('getValue'));

    url = HomeAssistantWebAPIUrl + "/api/history/period/" + str_queryTimeFrom +
        "?end_time=" + str_queryTimeTo + "&filter_entity_id=" + str_deviceid;

    var arr = [];
    $.ajax({
        type: "GET",
        url: url,
        beforeSend: function (request) {
            request.setRequestHeader("x-ha-access", authToken);
            request.setRequestHeader("Authorization", newToken);
        },
        cache: false,
        async: false,
        dataType: "json",
        success: function (data) {
            if (!data || !data.length || !data[0]) {
                return;
            }
            var datajson = data[0];
            $.each(datajson, function (i, n) {
                if (n.attributes &&
                    n.attributes['longitude'] !== null &&
                    n.attributes['longitude'] !== undefined &&
                    n.attributes['latitude'] !== null &&
                    n.attributes['latitude'] !== undefined &&
                    n.attributes['longitude'] !== "" &&
                    n.attributes['latitude'] !== "") {
                    arr.push({
                        'longitude': n.attributes['longitude'],
                        'latitude': n.attributes['latitude'],
                        'updatedate': (n.attributes['lastseen'] ? '最后出现：' + n.attributes['lastseen'] + '<br/>' : '') +
                            (n.attributes['latest_report_time'] ? '上报时间：' + n.attributes['latest_report_time'] + '<br/>记录时间：' : '') +
                            (getDatetime(n.last_updated) ? '' + getDatetime(n.last_updated) : ''),
                        'lnglat': [n.attributes['longitude'], n.attributes['latitude']]
                    });
                }
            });
        }
    });
    return arr;
}

function trackBtnShow() {
    if ($("#btnQuery").linkbutton("options").text == TXT.trackShow) {
        $("#btnDrawStart").hide();
        $("#btnDrawResume").hide();
        $("#btnDrawPause").hide();
        $("#btnDrawStop").hide();
    } else {
        $("#btnDrawStart").show();
        $("#btnDrawResume").show();
        $("#btnDrawPause").show();
        $("#btnDrawStop").show();
    }
}

/* ================= 回家路线 ================= */

function onBackhomeButtonClick() {
    if (!window.__backhomeButtonEnabled) {
        return;
    }
    window.__backhomeButtonEnabled = false;
    $('#btnBackhome').linkbutton('disable');
    setTimeout(function () {
        window.__backhomeButtonEnabled = true;
        $('#btnBackhome').linkbutton('enable');
    }, 2000);

    if ($("#btnBackhome").linkbutton("options").text == TXT.backShow) {
        var checked = getCheckedIds();
        if (checked.length === 0) {
            ysToast(t("noCheckedDevices"), true);
            return;
        }
        $('#btnBackhome').linkbutton({ text: TXT.backHide });
        backhomeTrackEnabled = true;
        for (var i = 0; i < checked.length; i++) {
            map.showdevicemarker(checked[i], true);
            drawDrivingMarkerWithLimit(checked[i], homePoint, backhomeTrackType);
        }
    } else {
        $('#btnBackhome').linkbutton({ text: TXT.backShow });
        backhomeTrackEnabled = false;
    }
    map.drawdrivingmarkerShow(backhomeTrackEnabled);
    SaveStorage();
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
        setTimeout(() => {
            map.drawdrivingmarker(deviceId, homePoint, backhomeTrackType);
        }, 1000 - (currentTime - lastCallTime));
        drawCount = 0;
        lastCallTime = Date.now();
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
            if (typeof (data) === 'string') {
                data = $.parseJSON(data);
            }
            homePoint = {
                'lon': data.longitude,
                'lat': data.latitude
            };
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
                if (n.entity_id && n.entity_id.indexOf('zone.') === 0 &&
                    n.attributes['longitude'] != undefined && n.attributes['latitude'] != null) {
                    arrZone.push({
                        'longitude': n.attributes['longitude'],
                        'latitude': n.attributes['latitude'],
                        'friendly_name': n.attributes['friendly_name'],
                        'entity_id': n.entity_id,
                        'radius': n.attributes['radius']
                    });
                }
            });
        }
    });
    if (callback) {
        callback();
    }
}

/* ================= 面板交互 ================= */

function toggleDevicePanel() {
    if ($('#deviceListWin').is(":visible")) {
        $('#deviceListWin').window('close');
    } else {
        layoutDevicePanel();
        $('#deviceListWin').window('open');
        setTimeout(layoutDevicePanel, 60);
    }
    syncToolbarState(['devicelist']);
}

function layoutDevicePanel() {
    var w = Math.min(360, Math.max(280, $(window).width() - 20));
    var h = Math.min(620, Math.max(360, $(window).height() - 90));
    try {
        $('#deviceListWin').window('resize', { width: w, height: h });
        $('#deviceListGrid').datagrid('resize');
    } catch (e) {
        /* 忽略 */
    }
}

function layoutDevicePanelSilently() {
    if ($('#deviceListWin').is(":visible")) {
        layoutDevicePanel();
    }
}

function syncToolbarState(ids) {
    for (var idIndex in ids) {
        var id = ids[idIndex];
        var enabled = false;
        try {
            enabled = eval("map.is" + id + "();");
        } catch (e) {
            enabled = false;
        }
        if (enabled) {
            $("#toolbar_" + id).attr("src", "images/toolbar_" + id + "_enable.png");
        } else {
            $("#toolbar_" + id).attr("src", "images/toolbar_" + id + "_disable.png");
        }
    }
}

/* ================= 本地存储 ================= */

function SaveStorage() {
    var data = {
        'cbBackhome.state': $("#cbBackhome").combobox("getValue"),
        'theme': window.YunshangTheme ? YunshangTheme.getMode() : "auto"
    };
    try {
        storage.setItem("yunshang_map_state", JSON.stringify(data));
    } catch (e) {
        /* 忽略 */
    }
}

function LoadStorage() {
    var data = null;
    try {
        data = storage.getItem("yunshang_map_state") || storage.getItem("inkwavemap");
    } catch (e) {
        data = null;
    }
    try {
        var dataObj = $.parseJSON(data);
        if (dataObj && dataObj['cbBackhome.state']) {
            $('#cbBackhome').combobox('select', dataObj['cbBackhome.state']);
        }
    } catch (ex) {
        /* 忽略 */
    }
}

/* ================= 工具函数 ================= */

function getDeviceListValue(deviceId, colName) {
    var row = deviceStore[deviceId];
    if (row && row[colName] !== undefined) {
        return row[colName];
    }
    return undefined;
}

function updateDeviceList(deviceId, newData) {
    var row = deviceStore[deviceId];
    if (!row) {
        return;
    }
    $.extend(row, newData);
    syncDeviceToGrid(row);
}

/* 高德地图事件回调：途中时间 / 状态 */
$(document).on("updateDrivingTime", function (event, params) {
    if (!params || !params['deviceId']) {
        return;
    }
    var row = deviceStore[params['deviceId']];
    if (!row) {
        return;
    }
    row.travel_time = isNaN(params['time']) ? params['time'] : formatSeconds(params['time']);
    syncDeviceToGrid(row);
});

$(document).on("updateDrivingState", function (event, params) {
    if (!params || !params['deviceId']) {
        return;
    }
    var row = deviceStore[params['deviceId']];
    if (!row) {
        return;
    }
    var state = params['state'];
    if (state === 'home' || state === 'Home') {
        row.state = TXT.stateHome;
        row.state_label = TXT.stateHome;
        row.state_cls = 'home';
        row.state_r = 'home';
    } else {
        row.state = state;
        row.state_label = state;
        row.state_cls = 'zone';
        row.state_r = state;
    }
    syncDeviceToGrid(row);
});
