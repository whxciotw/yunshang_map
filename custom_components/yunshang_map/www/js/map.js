/**
 * 云尚（高德）地图 - 地图对象统一封装（当前仅使用高德地图）
 */
function MapController() {
    this.maps = [
        new MapGaode(),
        new MapBaidu()
    ];
    this.currentMapIndex = 0;
}

MapController.prototype = {
    getMap: function () {
        return this.maps[this.currentMapIndex];
    },

    getTrackInfo: function () {
        return this.getMap().lastTrackInfo || null;
    },

    init: function (coordinate, zone) {
        this.getMap().init(coordinate, zone);
    },

    /** 切换地图底图样式：'amap://styles/dark' / 'amap://styles/normal' */
    setMapStyle: function (style) {
        var currentMap = this.getMap();
        if (currentMap && currentMap.map) {
            currentMap.map.setMapStyle(style);
        }
    },

    query: function (coordinate, flag) {
        if (flag && coordinate && coordinate.length > 0) {
            this.getMap().query(coordinate);
        }
        this.getMap().trackplayback(flag);
    },

    DrawStart: function () {
        this.getMap().DrawStart();
    },

    DrawPause: function () {
        this.getMap().DrawPause();
    },

    DrawResume: function () {
        this.getMap().DrawResume();
    },

    DrawStop: function () {
        this.getMap().DrawStop();
    },

    center: function (coordinate) {
        this.getMap().center(coordinate);
    },

    drawdevicemarker: function (deviceid, lableName, coordinate, icon, stateInfo) {
        this.getMap().drawdevicemarker(deviceid, lableName, coordinate, icon, stateInfo);
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
