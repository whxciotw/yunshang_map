/**
 * 云尚（高德）地图 - 地图对象统一封装（当前仅使用高德地图）
 */
function MapController() {
    this.maps = [
        new MapLeaflet()
    ];
    this.currentMapIndex = 0;
}

MapController.prototype = {
    getMap: function () {
        return this.maps[this.currentMapIndex];
    },

    reverseGeocode: function (lng, lat, callback) {
        if (this.getMap().reverseGeocode) {
            this.getMap().reverseGeocode(lng, lat, callback);
        } else {
            callback("");
        }
    },

    seek: function (progress) {
        if (this.getMap().seek) {
            return this.getMap().seek(progress);
        }
        return false;
    },

    getTrackProgress: function () {
        return this.getMap().getTrackProgress ? this.getMap().getTrackProgress() : 0;
    },

    getTrackInfo: function () {
        return this.getMap().lastTrackInfo || null;
    },

    init: function (coordinate, zone) {
        this.getMap().init(coordinate, zone);
    },

    /** 切换地图底图样式：dark / light */
    setMapStyle: function (style) {
        var currentMap = this.getMap();
        if (currentMap && currentMap.setMapStyle) {
            currentMap.setMapStyle(style === "amap://styles/dark" ? "dark" : style);
        }
    },

    query: function (coordinate, flag, iconInfo) {
        if (flag && coordinate && coordinate.length > 0) {
            this.getMap().query(coordinate, iconInfo);
        }
        this.getMap().trackplayback(flag);
    },

    /** 多设备轨迹：tracks = [{ id, name, points, iconInfo, color }] */
    queryMulti: function (tracks, flag) {
        if (flag && tracks && tracks.length > 0) {
            this.getMap().queryMulti(tracks);
        }
        this.getMap().trackplayback(flag);
    },

    DrawStart: function () {
        return this.getMap().DrawStart();
    },

    DrawPause: function () {
        return this.getMap().DrawPause();
    },

    DrawResume: function () {
        return this.getMap().DrawResume();
    },

    DrawStop: function () {
        return this.getMap().DrawStop();
    },

    center: function (coordinate) {
        this.getMap().center(coordinate);
    },

    /** 切换底图：amap / amap-satellite / baidu / baidu-satellite / osm */
    setBasemap: function (type) {
        this.getMap().setBasemap(type);
    },

    getBasemap: function () {
        return this.getMap().getBasemap();
    },

    getBasemapOptions: function () {
        return ysBasemapOptions();
    },

    /** 多设备历史轨迹 */
    setHistoryPaths: function (paths) {
        this.getMap().setHistoryPaths(paths);
    },

    clearHistoryPaths: function () {
        this.getMap().clearHistoryPaths();
    },

    drawdevicemarker: function (deviceid, lableName, coordinate, icon, stateInfo, accuracy) {
        this.getMap().drawdevicemarker(deviceid, lableName, coordinate, icon, stateInfo, accuracy);
    },

    /** 适配视野：所有可见设备 + 家 */
    fitAll: function () {
        this.getMap().fitAll();
    },

    /** 适配视野：当前轨迹 */
    fitTrack: function () {
        this.getMap().fitTrack();
    },

    /** 轨迹动画速度倍率 */
    setTrackSpeed: function (multiplier) {
        this.getMap().setTrackSpeed(multiplier);
    },

    getTrackSpeed: function () {
        return this.getMap().getTrackSpeed();
    },

    getTrackDuration: function () {
        return this.getMap().getTrackDuration();
    },

    showdevicemarker: function (deviceid, flag) {
        this.getMap().showdevicemarker(deviceid, flag);
    },

    drawdrivingmarker: function (deviceid, coordinate, tracktype) {
        this.getMap().drawdrivingmarker(deviceid, coordinate, tracktype);
    },

    cleardrivingmarker: function (deviceid) {
        this.getMap().cleardrivingmarker(deviceid);
    },

    drawdrivingmarkerShow: function (flag) {
        this.getMap().drawdrivingmarkerShow(flag);
    },

    zoomin: function () {
        this.getMap().zoomin();
    },

    zoomout: function () {
        this.getMap().zoomout();
    },

    homerange: function () {
        this.getMap().homerange();
    },

    homepoint: function () {
        this.getMap().homepoint();
    },

    traffic: function () {
        this.getMap().traffic();
    },

    devicelist: function () {
        var panel = $('#devicePanel');
        if (panel.length && panel.hasClass('is-open')) {
            panel.removeClass('is-open');
        } else if (panel.length) {
            panel.removeAttr('hidden').addClass('is-open');
        }
    },

    iszoomin: function () {
        return this.getMap().iszoomin();
    },

    iszoomout: function () {
        return this.getMap().iszoomout();
    },

    istraffic: function () {
        return this.getMap().istraffic();
    },

    ishomerange: function () {
        return this.getMap().ishomerange();
    },

    ishomepoint: function () {
        return this.getMap().ishomepoint();
    },

    isdevicelist: function () {
        var panel = $('#devicePanel');
        return panel.length > 0 && panel.hasClass('is-open');
    }
};
