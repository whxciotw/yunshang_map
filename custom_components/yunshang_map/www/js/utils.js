/* 云尚（高德）地图 - 通用工具函数 */

/** 补零 */
function p(s) {
    return s < 10 ? "0" + s : s;
}

/** 秒 -> 中文时长，例如 1小时5分12秒 */
function formatSeconds(value) {
    var total = parseInt(value, 10);
    if (isNaN(total) || total < 0) {
        return "";
    }
    var hours = 0;
    var minutes = 0;
    var seconds = total;
    if (seconds >= 60) {
        minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        if (minutes >= 60) {
            hours = Math.floor(minutes / 60);
            minutes = minutes % 60;
        }
    }
    var result = "";
    if (hours > 0) {
        result += hours + "小时";
    }
    if (minutes > 0) {
        result += minutes + "分";
    }
    result += seconds + "秒";
    return result;
}

/** 把 \\uXXXX 转成汉字（兼容老数据） */
function unicode2hanzi(data) {
    if (data === "" || data === null || data === undefined) {
        return "";
    }
    data = String(data).split("\\u");
    var str = "";
    for (var i = 0; i < data.length; i++) {
        str += String.fromCharCode(parseInt(data[i], 16).toString(10));
    }
    return str;
}

/** 当前日期 yyyy-mm-dd */
function getCurrentDate() {
    var myDate = new Date();
    return myDate.getFullYear() + "-" + p(myDate.getMonth() + 1) + "-" + p(myDate.getDate());
}

/** 时间 -> yyyy-mm-dd hh:mm:ss */
function getDatetime(d) {
    try {
        var myDate = new Date(d);
        return myDate.getFullYear() + "-" + p(myDate.getMonth() + 1) + "-" + p(myDate.getDate()) +
            " " + p(myDate.getHours()) + ":" + p(myDate.getMinutes()) + ":" + p(myDate.getSeconds());
    } catch (e) {
        return "";
    }
}

/** 时间 -> yyyy-mm-ddThh:mm:ss（Home Assistant API 格式） */
function getStandardDatetime(d) {
    try {
        var myDate = new Date(d);
        return myDate.getFullYear() + "-" + p(myDate.getMonth() + 1) + "-" + p(myDate.getDate()) +
            "T" + p(myDate.getHours()) + ":" + p(myDate.getMinutes()) + ":" + p(myDate.getSeconds());
    } catch (e) {
        return "";
    }
}

/** HTML 转义，避免设备名称破坏页面结构 */
function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** 打开 Home Assistant 原生的实体详情对话框 */
function openMoreInfo(entityId) {
    try {
        var event = new Event("hass-more-info", {
            bubbles: true,
            cancelable: false,
            composed: true
        });
        event.detail = { entityId: entityId };
        var host = (window.parent && window.parent !== window)
            ? window.parent.document.querySelector("home-assistant")
            : document.querySelector("home-assistant");
        if (host) {
            host.dispatchEvent(event);
        }
    } catch (e) {
        /* 独立打开页面时忽略 */
    }
}

/** 轻提示：优先使用页面内的 toast，退化为原生 alert */
function ysToast(message, isError) {
    if (window.YunshangTheme && window.YunshangTheme.showToast && !isError) {
        window.YunshangTheme.showToast(message);
        return;
    }
    var toast = document.getElementById("ysToast");
    if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        if (isError) {
            toast.classList.add("error");
        } else {
            toast.classList.remove("error");
        }
        clearTimeout(toast.__timer);
        toast.__timer = setTimeout(function () {
            toast.classList.remove("show");
            toast.classList.remove("error");
        }, isError ? 3600 : 1800);
    } else {
        alert(message);
    }
}


/** 地图加载提示：显示错误信息 */
function showMapError(title, detail) {
    var el = document.getElementById("mapLoading");
    var text = document.getElementById("mapLoadingText");
    if (el) {
        el.classList.remove("hide");
        el.classList.add("error");
    }
    if (text) {
        text.innerHTML = "<b>" + escapeHtml(title) + "</b><br>" +
            "<span style='font-size:12px;color:var(--ys-text-dim)'>" + escapeHtml(detail) + "</span>";
    }
}

/** 隐藏地图加载提示 */
function hideMapLoading() {
    var el = document.getElementById("mapLoading");
    if (el) {
        el.classList.add("hide");
    }
}
