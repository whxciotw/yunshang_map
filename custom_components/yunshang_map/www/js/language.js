/**
 * 定制地图 - 界面文案
 * 中文优先：页面默认使用简体中文，英文仅作备用。
 */
var lang = "zh";

var I18N = {
    zh: {
        loading: "加载中…",
        mapLoading: "地图加载中…",
        mapLoadFailed: "地图加载失败",
        mapLoadFailedDetail: "请检查网络连接，或确认高德地图 API Key 配置正确。",
        tokenMissing: "获取授权 Token 失败",
        tokenMissingDetail: "如果是在 Home Assistant 中嵌入显示，会自动复用当前登录会话，无需令牌；只有在独立浏览器中直接打开地图页面时，才需要在集成选项中配置长期访问令牌。",
        deviceListTitle: "设备列表",
        colName: "设备名称",
        colState: "状态",
        searchPlaceholder: "搜索设备名称…",
        refresh: "刷新",
        sectionBackhome: "回家路线",
        sectionTrack: "轨迹回放",
        timeFrom: "开始",
        timeTo: "结束",
        presetToday: "今天",
        presetYesterday: "昨天",
        preset7d: "近7天",
        trackShow: "显示运动轨迹",
        trackHide: "隐藏运动轨迹",
        backShow: "显示回家路线",
        backHide: "隐藏回家路线",
        backDrive: "驾车",
        backRide: "骑行",
        backWalk: "步行",
        drawStart: "开始轨迹动画",
        drawPause: "暂停动画",
        drawResume: "继续动画",
        drawStop: "停止动画",
        stateHome: "在家",
        stateAway: "离家",
        stateUnknown: "未知",
        travelTime: "回家用时",
        noDevices: "未发现可追踪的设备",
        noDeviceSelected: "请先在设备列表中选择一个设备",
        noCheckedDevices: "请先在设备列表勾选需要显示回家路线的设备",
        noTrackData: "该设备在所选时间段内没有轨迹数据",
        trackLoading: "正在加载轨迹…",
        invalidTimeRange: "开始时间必须早于结束时间",
        themeMode: "主题模式",
        themeLight: "浅色",
        themeDark: "深色",
        themeAuto: "跟随系统",
        themeChanged: "主题已切换为：{mode}",
        searchNoResult: "没有匹配的设备",
        deviceCount: "共 {n} 个设备",
        moreInfo: "设备详情",
        homeDevices: "在家设备",
    },
    en: {
        loading: "Loading…",
        mapLoading: "Loading map…",
        mapLoadFailed: "Failed to load map",
        mapLoadFailedDetail: "Please check the network connection or the AMap API key.",
        tokenMissing: "Failed to get the access token",
        tokenMissingDetail: "When embedded in Home Assistant the current login session is reused automatically. A long-lived access token is only needed when opening the map page directly in a standalone browser.",
        deviceListTitle: "Devices",
        colName: "Device",
        colState: "Status",
        searchPlaceholder: "Search devices…",
        refresh: "Refresh",
        sectionBackhome: "Route home",
        sectionTrack: "Track playback",
        timeFrom: "From",
        timeTo: "To",
        presetToday: "Today",
        presetYesterday: "Yesterday",
        preset7d: "Last 7 days",
        trackShow: "Show track",
        trackHide: "Hide track",
        backShow: "Show route home",
        backHide: "Hide route home",
        backDrive: "Drive",
        backRide: "Ride",
        backWalk: "Walk",
        drawStart: "Start",
        drawPause: "Pause",
        drawResume: "Resume",
        drawStop: "Stop",
        stateHome: "Home",
        stateAway: "Away",
        stateUnknown: "Unknown",
        travelTime: "Travel time",
        noDevices: "No trackable devices found",
        noDeviceSelected: "Please select a device in the list first",
        noCheckedDevices: "Please check the devices in the list first",
        noTrackData: "No track data for this device in the selected period",
        trackLoading: "Loading track…",
        invalidTimeRange: "The start time must be earlier than the end time",
        themeMode: "Theme",
        themeLight: "Light",
        themeDark: "Dark",
        themeAuto: "Follow system",
        themeChanged: "Theme: {mode}",
        searchNoResult: "No matching devices",
        deviceCount: "{n} devices",
        moreInfo: "Details",
        homeDevices: "Devices at home",
    }
};

var TXT = I18N[lang] || I18N.zh;

/** 取一条界面文案，支持 {name} 占位符。 */
function t(key, params) {
    var text = (TXT[key] !== undefined ? TXT[key] : (I18N.zh[key] !== undefined ? I18N.zh[key] : key));
    if (params) {
        for (var k in params) {
            if (Object.prototype.hasOwnProperty.call(params, k)) {
                text = text.replace(new RegExp("\\{" + k + "\\}", "g"), params[k]);
            }
        }
    }
    return text;
}

/* —— 以下为旧版变量，保留以兼容原有逻辑 —— */
var txtQueryTimeFrom = { zh: TXT.timeFrom, en: I18N.en.timeFrom };
var txtQueryTimeTo = { zh: TXT.timeTo, en: I18N.en.timeTo };
var txtDrawStart = { zh: TXT.drawStart, en: I18N.en.drawStart };
var txtDrawPause = { zh: TXT.drawPause, en: I18N.en.drawPause };
var txtDrawResume = { zh: TXT.drawResume, en: I18N.en.drawResume };
var txtDrawStop = { zh: TXT.drawStop, en: I18N.en.drawStop };
var txtTrackShow = { zh: TXT.trackShow, en: I18N.en.trackShow };
var txtTrackHide = { zh: TXT.trackHide, en: I18N.en.trackHide };
var txtBackShow = { zh: TXT.backShow, en: I18N.en.backShow };
var txtBackHide = { zh: TXT.backHide, en: I18N.en.backHide };
var txtBackDrive = { zh: TXT.backDrive, en: I18N.en.backDrive };
var txtBackRide = { zh: TXT.backRide, en: I18N.en.backRide };
var txtBackWalk = { zh: TXT.backWalk, en: I18N.en.backWalk };
