/**
 * 定制地图 - 坐标系工具
 *
 * Home Assistant 中的坐标是 WGS84；
 * 高德瓦片使用 GCJ02，百度瓦片使用 BD09。
 * 这里提供 WGS84 -> GCJ02 -> BD09 的转换，以及 Leaflet 的百度 CRS。
 */
(function (global) {
    "use strict";

    var PI = 3.1415926535897932384626;
    var A = 6378245.0;
    var EE = 0.00669342162296594323;
    var X_PI = PI * 3000.0 / 180.0;

    function outOfChina(lng, lat) {
        return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
    }

    function transformLat(lng, lat) {
        var s = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
        s += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
        s += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
        s += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
        return s;
    }

    function transformLng(lng, lat) {
        var s = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
        s += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
        s += (20.0 * Math.sin(lng * PI) + 40.0 * Math.sin(lng / 3.0 * PI)) * 2.0 / 3.0;
        s += (150.0 * Math.sin(lng / 12.0 * PI) + 300.0 * Math.sin(lng / 30.0 * PI)) * 2.0 / 3.0;
        return s;
    }

    /** WGS84 -> GCJ02（高德） */
    function wgs84ToGcj02(lng, lat) {
        if (outOfChina(lng, lat)) {
            return [lng, lat];
        }
        var dLat = transformLat(lng - 105.0, lat - 35.0);
        var dLng = transformLng(lng - 105.0, lat - 35.0);
        var radLat = lat / 180.0 * PI;
        var magic = Math.sin(radLat);
        magic = 1 - EE * magic * magic;
        var sqrtMagic = Math.sqrt(magic);
        dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
        dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
        return [lng + dLng, lat + dLat];
    }

    /** GCJ02 -> WGS84 */
    function gcj02ToWgs84(lng, lat) {
        if (outOfChina(lng, lat)) {
            return [lng, lat];
        }
        var wgs = wgs84ToGcj02(lng, lat);
        return [lng * 2 - wgs[0], lat * 2 - wgs[1]];
    }

    /** GCJ02 -> BD09（百度） */
    function gcj02ToBd09(lng, lat) {
        var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
        var theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
        return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
    }

    /** BD09 -> GCJ02 */
    function bd09ToGcj02(lng, lat) {
        var x = lng - 0.0065, y = lat - 0.006;
        var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
        var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
        return [z * Math.cos(theta), z * Math.sin(theta)];
    }

    /** WGS84 -> BD09 */
    function wgs84ToBd09(lng, lat) {
        var gcj = wgs84ToGcj02(lng, lat);
        return gcj02ToBd09(gcj[0], gcj[1]);
    }

    /** 百度瓦片 CRS（基于 proj4leaflet，与 Leaflet.ChineseTmsProviders 的实现一致） */
    function installBaiduCRS(L) {
        if (L.CRS.Baidu) {
            return;
        }
        if (!L.Proj || !L.Proj.CRS) {
            return;
        }
        L.CRS.Baidu = new L.Proj.CRS(
            "EPSG:900913",
            "+proj=merc +a=6378206 +b=6356584.314245179 +lat_ts=0.0 +lon_0=0.0 +x_0=0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs",
            {
                resolutions: (function () {
                    var level = 19;
                    var res = [];
                    res[0] = Math.pow(2, 18);
                    for (var i = 1; i < level; i++) {
                        res[i] = Math.pow(2, 18 - i);
                    }
                    return res;
                })(),
                origin: [0, 0],
                bounds: L.bounds([20037508.342789244, 0], [0, 20037508.342789244])
            }
        );
    }

    /** 平面近似距离（米）；兼容 {lon,lat} 与 {lng,lat} 两种写法 */
    function distanceMeters(a, b) {
        var R = 6371000;
        var rad = PI / 180;
        var aLng = (a.lon !== undefined) ? a.lon : a.lng;
        var bLng = (b.lon !== undefined) ? b.lon : b.lng;
        if (aLng === undefined || bLng === undefined || a.lat === undefined || b.lat === undefined) {
            return 0;
        }
        var dLat = (b.lat - a.lat) * rad;
        var dLng = (bLng - aLng) * rad;
        var x = dLng * Math.cos((a.lat + b.lat) / 2 * rad);
        return Math.sqrt(dLat * dLat + x * x) * R;
    }

    global.YSGeo = {
        wgs84ToGcj02: wgs84ToGcj02,
        gcj02ToWgs84: gcj02ToWgs84,
        gcj02ToBd09: gcj02ToBd09,
        bd09ToGcj02: bd09ToGcj02,
        wgs84ToBd09: wgs84ToBd09,
        installBaiduCRS: installBaiduCRS,
        distanceMeters: distanceMeters
    };
})(window);
