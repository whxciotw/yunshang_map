/**
 * 定制地图 - 追踪设备解析工具
 * 负责：设备图标选择（优先图标）、状态文案、列表单元格渲染。
 */

function ysIconPath(key) {
    if (!key || typeof YUNSHANG_DEVICE_ICON_PATHS === "undefined") {
        return null;
    }
    if (YUNSHANG_DEVICE_ICON_PATHS[key]) {
        return YUNSHANG_DEVICE_ICON_PATHS[key];
    }
    var alias = (typeof YUNSHANG_DEVICE_ICON_ALIASES !== "undefined") ? YUNSHANG_DEVICE_ICON_ALIASES[key] : null;
    if (alias && YUNSHANG_DEVICE_ICON_PATHS[alias]) {
        return YUNSHANG_DEVICE_ICON_PATHS[alias];
    }
    return null;
}

/* 按设备名称 / 实体 ID 推断图标（顺序敏感：更具体的写在前面） */
var YS_ICON_KEYWORDS = [
    [/自行车|单车|脚踏车|bicycle|bike|cycling/i, "bicycle"],
    [/电动自行车|电瓶车|踏板车|e-?bike|scooter|moped/i, "moped"],
    [/特斯拉|蔚来|小鹏|理想|比亚迪|新能源|电动车|tesla|nio|xpeng|li-auto|byd|car-electric|ev-?car/i, "car-electric"],
    [/摩托|机车|motor/i, "motorcycle"],
    [/卡车|货车|truck|lorry/i, "truck"],
    [/叉车|forklift/i, "forklift"],
    [/越野|suv/i, "car-estate"],
    [/汽车|轿车|小车|car|sedan|auto/i, "car"],
    [/公交|巴士|客车|bus/i, "bus"],
    [/地铁|subway|metro/i, "subway-variant"],
    [/高铁|火车|动车|轻轨|train|rail/i, "train"],
    [/飞机|航班|airplane|plane|flight/i, "airplane"],
    [/直升|helicopter/i, "helicopter"],
    [/轮船|渡轮|游船|ferry|ship/i, "ferry"],
    [/帆船|船|sail|boat/i, "sail-boat"],
    [/皮划艇|kayak/i, "kayaking"],
    [/滑雪|ski/i, "ski"],
    [/轮椅|wheelchair/i, "wheelchair-accessibility"],
    [/婴儿|宝宝|童车|baby|stroller/i, "baby-carriage"],
    [/步行|走路|散步|walk|hiking|徒步/i, "walk"],
    [/跑步|running|jog/i, "run"],
    [/骑行|骑车|单车|cycling/i, "bicycle"],
    [/宠物|狗狗|dog|puppy/i, "dog"],
    [/猫|cat|kitten/i, "cat"],
    [/手表|手环|watch|band/i, "watch"],
    [/手机|电话|phone|mobile/i, "cellphone"],
    [/平板|tablet|ipad/i, "tablet"],
    [/电脑|笔记本|laptop|notebook|pc/i, "laptop"],
    [/钥匙|key/i, "key"],
    [/家|home|house/i, "home"],
    [/公司|办公|工作|office|work|company/i, "briefcase"],
    [/学校|校园|school|大学|college/i, "school"],
    [/医院|hospital|clinic/i, "hospital"],
    [/仓库|工厂|warehouse|factory/i, "warehouse"],
    [/商场|购物|shopping|store|mall/i, "shopping"],
    [/导航|路线|导航仪|navigation|gps/i, "navigation-variant"],
    [/人|个人|user|person|人员|孩子|儿童/i, "account"],
];

function ysInferIconKey(name) {
    if (!name) {
        return null;
    }
    for (var i = 0; i < YS_ICON_KEYWORDS.length; i++) {
        if (YS_ICON_KEYWORDS[i][0].test(name)) {
            return YS_ICON_KEYWORDS[i][1];
        }
    }
    return null;
}

/**
 * 解析设备图标，优先级：
 * 1) entity_picture（实体图片）
 * 2) 实体自定义 icon（mdi:xxx）
 * 3) 设备名称/实体 ID 关键字推断
 * 4) 默认定位图标
 * @returns {{kind:string, picture?:string, path?:string, key?:string}}
 */
function ysResolveDeviceIcon(stateObj) {
    stateObj = stateObj || {};
    var attrs = stateObj.attributes || {};

    if (attrs.entity_picture) {
        return { kind: "picture", picture: attrs.entity_picture };
    }

    var iconName = attrs.icon || "";
    if (typeof iconName === "string" && iconName.indexOf("mdi:") === 0) {
        var key = iconName.slice(4);
        var path = ysIconPath(key);
        if (path) {
            return { kind: "icon", path: path, key: key };
        }
    }

    var text = (attrs.friendly_name || "") + " " + (stateObj.entity_id || "");
    var inferred = ysInferIconKey(text);
    if (inferred) {
        var inferredPath = ysIconPath(inferred);
        if (inferredPath) {
            return { kind: "icon", path: inferredPath, key: inferred };
        }
    }

    var defaultPath = ysIconPath(typeof YUNSHANG_DEFAULT_DEVICE_ICON !== "undefined"
        ? YUNSHANG_DEFAULT_DEVICE_ICON
        : "map-marker-account");
    return { kind: "icon", path: defaultPath, key: "default" };
}

/** 设备状态 -> 展示信息 */
function ysDeviceStateInfo(stateObj) {
    stateObj = stateObj || {};
    var raw = stateObj.state === undefined || stateObj.state === null ? "unknown" : String(stateObj.state);
    var attrs = stateObj.attributes || {};
    var address = attrs.address || attrs.location_name || "";

    var info = { raw: raw, label: raw, cls: "zone", address: address };
    if (raw === "home") {
        info.label = t("stateHome");
        info.cls = "home";
    } else if (raw === "not_home") {
        info.label = t("stateAway");
        info.cls = "away";
    } else if (raw === "unknown" || raw === "unavailable") {
        info.label = t("stateUnknown");
        info.cls = "unknown";
    }
    return info;
}

/** SVG 图标 -> data URI，用于设备列表单元格 */
function ysIconDataUri(icon, color) {
    if (!icon) {
        return "";
    }
    if (icon.kind === "picture") {
        return icon.picture || "";
    }
    var path = icon.path;
    if (!path) {
        return "";
    }
    var fill = color || "#1677ff";
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<path fill="' + fill + '" d="' + path + '"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** 地图标记内容的 HTML */
function ysMarkerHtml(name, icon, stateInfo) {
    var iconHtml;
    if (icon && icon.kind === "picture" && icon.picture) {
        iconHtml = '<img class="ys-marker-picture" src="' + escapeHtml(icon.picture) + '" alt="">';
    } else {
        var path = (icon && icon.path) ? icon.path : ysIconPath("map-marker-account");
        iconHtml = '<svg class="ys-marker-svg" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="' + path + '"/></svg>';
    }
    var cls = (stateInfo && stateInfo.cls) ? stateInfo.cls : "zone";
    var safeName = escapeHtml(name || "");
    return '<div class="ys-marker ys-marker-' + cls + '" title="' + safeName + '">' +
        '<div class="ys-marker-badge">' + iconHtml + '</div>' +
        '<div class="ys-marker-label"><span>' + safeName + '</span></div>' +
        '</div>';
}

/** 设备列表“名称”列格式化 */
function ysNameFormatter(value, row) {
    var iconHtml;
    var uri = row.icon_data_uri;
    if (uri) {
        iconHtml = '<img class="ys-grid-icon" src="' + uri + '" alt="">';
    } else {
        iconHtml = '<span class="ys-grid-icon ys-grid-icon-empty"></span>';
    }
    return '<div class="ys-grid-name">' + iconHtml +
        '<div class="ys-grid-name-text">' + escapeHtml(value || row.id || "") + '</div></div>';
}

/** 设备列表“状态”列格式化 */
function ysStateFormatter(value, row) {
    var cls = row.state_cls || "zone";
    var label = row.state_label || value || "";
    var html = '<div class="ys-grid-state"><span class="ys-state ys-state-' + cls + '">' +
        escapeHtml(label) + '</span>';
    if (row.address) {
        html += '<div class="ys-state-address">' + escapeHtml(row.address) + '</div>';
    }
    if (row.travel_time) {
        html += '<div class="ys-state-time">' + t("travelTime") + " " + escapeHtml(row.travel_time) + '</div>';
    }
    html += '</div>';
    return html;
}

/** 把状态对象转换成设备列表/地图需要的数据（id 使用完整 entity_id） */
function ysBuildDeviceRow(entityId, stateObj) {
    var stateObjSafe = stateObj || {};
    var attrs = stateObjSafe.attributes || {};
    var icon = ysResolveDeviceIcon(stateObjSafe);
    var stateInfo = ysDeviceStateInfo(stateObjSafe);
    var entityIdValue = entityId || stateObjSafe.entity_id || "";

    return {
        id: entityIdValue,
        entity_id: entityIdValue,
        name: attrs.friendly_name || entityIdValue,
        lon: attrs.longitude,
        lat: attrs.latitude,
        accuracy: attrs.gps_accuracy || attrs.accuracy || 0,
        state: stateInfo.label,
        state_label: stateInfo.label,
        state_cls: stateInfo.cls,
        state_r: stateInfo.raw,
        address: stateInfo.address,
        icon_kind: icon.kind,
        icon_key: icon.key || "",
        icon_path: icon.path || "",
        icon_picture: icon.picture || "",
        icon_data_uri: ysIconDataUri(icon, stateInfo.cls === "unknown" ? "#8b95a5" : "#1677ff"),
    };
}

/** 轨迹动画使用的移动标记内容（实体图标/图片 + 可选颜色边框，多设备时用于区分） */
function ysTrackMarkerHtml(icon, color) {
    var iconHtml;
    if (icon && icon.kind === "picture" && icon.picture) {
        iconHtml = '<img class="ys-track-picture" src="' + escapeHtml(icon.picture) + '" alt="">';
    } else {
        var path = (icon && icon.path) ? icon.path : ysIconPath("map-marker-account");
        iconHtml = '<svg class="ys-track-svg" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="' + path + '"/></svg>';
    }
    var style = color ? ' style="border-color:' + escapeHtml(color) + '"' : "";
    return '<div class="ys-track-marker"><div class="ys-track-marker-badge"' + style + '>' +
        iconHtml + '</div></div>';
}
