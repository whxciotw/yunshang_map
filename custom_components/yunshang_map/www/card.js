/**
 * 云尚（高德）地图 - 卡片（iframe）页面逻辑
 * 在 Lovelace 中嵌入单个（或一组）设备的地图位置。
 */
var map = new Map();
var homePoint = null;
var getDataMode = "client";
var storage = null;
var authToken = null;
var newTokens = null;
var newToken = null;
var mapInitialized = false;
var pollTimer = null;
var hasCentered = false;
var lastDriveTime = 0;

IDLists = query.get('idlist', '');

$(function () {
    storage = window.localStorage;

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

    if (authToken == null && newToken == null) {
        showMapError(t("tokenMissing"), t("tokenMissingDetail"));
        return;
    }

    loadHomePoint();
    var arrZone = [];
    loadZones(arrZone);

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

    $("#toolbar_zoomin").click(function () {
        map.zoomin();
    });
    $("#toolbar_zoomout").click(function () {
        map.zoomout();
    });

    setTimeout(function () {
        if (!mapInitialized) {
            showMapError(t("mapLoadFailed"), t("mapLoadFailedDetail"));
        }
    }, 18000);
});

$(document).on("mapInitFinished", function () {
    mapInitialized = true;
    hideMapLoading();
    applyMapTheme();
    refreshDevices();
    pollTimer = setInterval(refreshDevices, 10000);
});

$(document).on("themechange", function () {
    applyMapTheme();
});

$(document).on("zoomchange", function () {
    /* 卡片中缩放按钮常亮即可 */
});

function applyMapTheme() {
    if (!mapInitialized) {
        return;
    }
    var resolved = (window.YunshangTheme ? YunshangTheme.resolve() : "light");
    map.setMapStyle(resolved === "dark" ? "amap://styles/dark" : "amap://styles/normal");
}

function refreshDevices() {
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
        }
    });
}

function handleStates(states) {
    if (!states || !states.length) {
        return;
    }
    var idlist = (IDLists || "").replace(/device_tracker\./g, "").split(",");
    idlist = idlist.filter(function (v) { return v !== ""; });

    var firstCenter = null;
    for (var index in states) {
        var stateObj = states[index];
        if (!stateObj || !stateObj.entity_id || stateObj.entity_id.indexOf("device_tracker.") !== 0) {
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
        map.drawdevicemarker(deviceId, row.name, { 'lon': row.lon, 'lat': row.lat }, {
            kind: row.icon_kind,
            picture: row.icon_picture,
            path: row.icon_path,
            key: row.icon_key
        }, { cls: row.state_cls });

        if (!firstCenter) {
            firstCenter = row;
        }

        /* 保持原有行为：卡片内显示回家的驾车路线（限频，避免频繁请求） */
        var now = Date.now();
        if (now - lastDriveTime > 2000) {
            lastDriveTime = now;
            map.drawdrivingmarker(deviceId, homePoint, "drive");
        }
    }

    if (firstCenter && !hasCentered) {
        hasCentered = true;
        map.center({ 'lon': firstCenter.lon, 'lat': firstCenter.lat });
    }
}

function loadHomePoint() {
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
}

function loadZones(arrZone) {
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
}
