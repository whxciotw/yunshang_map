/**
 * 定制地图 - Leaflet 地图引擎
 *
 * 使用 Leaflet + 栅格瓦片渲染，相比矢量引擎平移/缩放更顺畅；
 * 支持高德、百度、OSM 等多种底图，以及设备标记、精度圈、轨迹回放、
 * 多设备历史轨迹、回家路线（路线计算使用高德服务）等。
 *
 * 所有数据内部统一使用 WGS84 保存，渲染时按底图坐标系转换。
 */
function MapLeaflet() {
    this.map = null;
    this.mapType = null;
    this.clusterGroup = null;
    this.zoneLayers = [];
    this.zoneMarkerLayers = [];
    this.zoneRangeLayers = [];
    this.deviceMarkers = {};
    this.accuracyLayers = {};
    this.trackLayers = {};
    this.trackAnim = null;
    this.trackSpeed = 1;
    this.lastTrackInfo = null;
    this.lastTrackOriginal = 0;
    this.routeLayers = {};
    this.historyLayers = [];
    this.trafficLayer = null;
    this.dark = false;
    this.state = {
        mapType: "amap",
        centerWgs: null,
        zoom: 15,
        zones: [],
        devices: {},
        track: null,
        routes: {},
        history: [],
        flags: {
            traffic: false,
            homepoint: false,
            homerange: false
        }
    };
    this._amapLoading = false;
    this._amapCallbacks = [];
}

/* ============================== 底图定义 ============================== */

var LEAFLET_BASEMAPS = {
    amap: {
        label: "高德地图",
        crs: "gcj",
        url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        subdomains: "1234",
        minZoom: 3,
        maxZoom: 18
    },
    "amap-satellite": {
        label: "高德卫星",
        crs: "gcj",
        url: "https://webst0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}",
        subdomains: "1234",
        minZoom: 3,
        maxZoom: 18
    },
    "amap-traffic": {
        label: "高德路况",
        crs: "gcj",
        url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        subdomains: "1234",
        minZoom: 3,
        maxZoom: 18,
        traffic: true
    },
    baidu: {
        label: "百度地图",
        crs: "bd09",
        url: "https://maponline{s}.bdimg.com/onlinelabel/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1&p=1",
        subdomains: "0123",
        tms: true,
        minZoom: 4,
        maxZoom: 18
    },
    "baidu-satellite": {
        label: "百度卫星",
        crs: "bd09",
        url: "https://maponline{s}.bdimg.com/starpic/?qt=satepc&u=x={x};y={y};z={z};v=009;type=sate&fm=46",
        subdomains: "0123",
        tms: true,
        minZoom: 4,
        maxZoom: 18
    },
    "baidu-traffic": {
        label: "百度路况",
        crs: "bd09",
        url: "https://maponline{s}.bdimg.com/onlinelabel/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1&p=1",
        subdomains: "0123",
        tms: true,
        minZoom: 4,
        maxZoom: 18,
        traffic: true
    },
    osm: {
        label: "OSM 地图",
        crs: "wgs",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        subdomains: "abc",
        minZoom: 3,
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
};

var LEAFLET_TRAFFIC_TILES = {
    gcj: "https://tm.amap.com/trafficengine/mapabc/traffictile?v=1.0&x={x}&y={y}&z={z}&t=1",
    bd09: "http://its.map.baidu.com:8002/traffic/TrafficTileService?x={x}&y={y}&level={z}&time=1&label=web2D&v=017"
};

/* ============================== 工具 ============================== */

function ysBasemapOptions() {
    var out = [];
    for (var key in LEAFLET_BASEMAPS) {
        if (Object.prototype.hasOwnProperty.call(LEAFLET_BASEMAPS, key)) {
            out.push({ id: key, label: LEAFLET_BASEMAPS[key].label });
        }
    }
    return out;
}

MapLeaflet.prototype = {

    /* ---------------- 初始化 ---------------- */

    init: function (coordinate, zone) {
        if (typeof L === "undefined") {
            return;
        }
        if (typeof YSGeo !== "undefined") {
            YSGeo.installBaiduCRS(L);
        }
        var savedType = null;
        try {
            savedType = window.localStorage.getItem("yunshang_map_basemap");
        } catch (e) {
            savedType = null;
        }
        var queryType = (typeof query !== "undefined" && query.get) ? query.get("maptype") : null;
        var initialType = queryType || savedType || "amap";
        if (!LEAFLET_BASEMAPS[initialType]) {
            initialType = "amap";
        }
        this.state.mapType = initialType;
        this.state.centerWgs = { lon: coordinate.lon, lat: coordinate.lat };
        this.state.zoom = (typeof ZOOM !== "undefined" && Number(ZOOM)) ? Number(ZOOM) : 15;
        this.state.zones = (zone || []).slice();
        this._buildMap();
    },

    _currentBasemap: function () {
        return LEAFLET_BASEMAPS[this.state.mapType] || LEAFLET_BASEMAPS.amap;
    },

    _crs: function () {
        var def = this._currentBasemap();
        if (def.crs === "bd09") {
            return L.CRS.Baidu;
        }
        return L.CRS.EPSG3857;
    },

    _toLatLng: function (wgs) {
        var def = this._currentBasemap();
        var lng = wgs.lon;
        var lat = wgs.lat;
        if (def.crs === "gcj") {
            var gcj = YSGeo.wgs84ToGcj02(lng, lat);
            lng = gcj[0];
            lat = gcj[1];
        } else if (def.crs === "bd09") {
            var bd = YSGeo.wgs84ToBd09(lng, lat);
            lng = bd[0];
            lat = bd[1];
        }
        return L.latLng(lat, lng);
    },

    _toLatLngGcj: function (gcj) {
        var def = this._currentBasemap();
        var lng = gcj.lng;
        var lat = gcj.lat;
        if (def.crs === "wgs") {
            var wgs = YSGeo.gcj02ToWgs84(lng, lat);
            lng = wgs[0];
            lat = wgs[1];
        } else if (def.crs === "bd09") {
            var bd = YSGeo.gcj02ToBd09(lng, lat);
            lng = bd[0];
            lat = bd[1];
        }
        return L.latLng(lat, lng);
    },

    _fromLatLng: function (latlng) {
        var def = this._currentBasemap();
        var lng = latlng.lng;
        var lat = latlng.lat;
        if (def.crs === "gcj") {
            var wgs = YSGeo.gcj02ToWgs84(lng, lat);
            lng = wgs[0];
            lat = wgs[1];
        } else if (def.crs === "bd09") {
            var gcj = YSGeo.bd09ToGcj02(lng, lat);
            var wgs2 = YSGeo.gcj02ToWgs84(gcj[0], gcj[1]);
            lng = wgs2[0];
            lat = wgs2[1];
        }
        return { lon: lng, lat: lat };
    },

    _buildMap: function () {
        var that = this;
        var def = this._currentBasemap();

        /* 保留当前视野与缩放 */
        if (this.map) {
            this.state.zoom = this.map.getZoom();
            var center = this.map.getCenter();
            this.state.centerWgs = this._fromLatLng(center);
            this.map.remove();
            this.map = null;
        }
        this._stopTrackAnimation();
        this.zoneLayers = [];
        this.zoneMarkerLayers = [];
        this.zoneRangeLayers = [];
        this.deviceMarkers = {};
        this.accuracyLayers = {};
        this.routeLayers = {};
        this.historyLayers = [];
        this.trafficLayer = null;
        this.trackLayers = {};
        if (this.trackAnim) {
            this.trackAnim.running = false;
            this.trackAnim.paused = false;
        }

        this.map = L.map("mapContainer", {
            crs: this._crs(),
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true,
            minZoom: def.minZoom || 3,
            maxZoom: def.maxZoom || 18,
            zoomSnap: 0.5,
            wheelDebounceTime: 20
        });
        this.map.setView(this._toLatLng(this.state.centerWgs), this.state.zoom, { animate: false });

        this.baseLayer = L.tileLayer(def.url, {
            subdomains: def.subdomains ? def.subdomains.split("") : "abc",
            tms: !!def.tms,
            minZoom: def.minZoom || 3,
            maxZoom: def.maxZoom || 18,
            detectRetina: false,
            crossOrigin: false,
            attribution: def.attribution || ""
        }).addTo(this.map);

        if (def.attribution) {
            this.attributionControl = L.control.attribution({ prefix: false, position: "bottomright" });
            this.attributionControl.addTo(this.map);
        }

        L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 120 }).addTo(this.map);

        if (typeof L.markerClusterGroup === "function") {
            this.clusterGroup = L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 45,
                spiderfyOnMaxZoom: true,
                disableClusteringAtZoom: 18,
                iconCreateFunction: function (cluster) {
                    return L.divIcon({
                        html: '<div class="ys-cluster"><span>' + cluster.getChildCount() + '</span></div>',
                        className: "ys-leaflet-cluster",
                        iconSize: [38, 38],
                        iconAnchor: [19, 19]
                    });
                }
            });
            this.map.addLayer(this.clusterGroup);
        } else {
            this.clusterGroup = null;
        }

        if (this.state.flags.traffic) {
            this._addTrafficTiles();
        }

        this._drawZones();
        this._drawDevices();
        this._drawTrackStatic();
        this._drawRoutes();
        this._drawHistory();
        this._applyDark();

        this.map.on("zoomend", function () {
            $(document).trigger("mapzoomend");
        });

        if (!this._initializedOnce) {
            this._initializedOnce = true;
            $(document).trigger("mapInitFinished");
        } else {
            $(document).trigger("mapRebuilt");
        }
    },

    /* ---------------- 底图 / 主题 ---------------- */

    getBasemap: function () {
        return this.state.mapType;
    },

    setBasemap: function (type) {
        if (!LEAFLET_BASEMAPS[type] || type === this.state.mapType) {
            return;
        }
        this.state.mapType = type;
        try {
            window.localStorage.setItem("yunshang_map_basemap", type);
        } catch (e) {
            /* 忽略 */
        }
        this._buildMap();
    },

    setMapStyle: function (style) {
        this.dark = (style === "dark" || style === "amap://styles/dark");
        this._applyDark();
    },

    _applyDark: function () {
        if (!this.map) {
            return;
        }
        var container = this.map.getContainer();
        var def = this._currentBasemap();
        container.classList.toggle("ys-map-dark", !!this.dark);
    },

    /* ---------------- 区域 / 家 ---------------- */

    _zoneRadius: function (zone) {
        return Number(zone.radius) > 0 ? Number(zone.radius) : 100;
    },

    _homeZone: function () {
        for (var i = 0; i < this.state.zones.length; i++) {
            if (this.state.zones[i].entity_id === "zone.home") {
                return this.state.zones[i];
            }
        }
        return null;
    },

    _drawZones: function () {
        var that = this;
        this.zoneMarkerLayers = [];
        this.zoneRangeLayers = [];
        for (var i = 0; i < this.state.zones.length; i++) {
            (function (zone) {
                var latlng = that._toLatLng({ lon: zone.longitude, lat: zone.latitude });
                var label = zone.friendly_name || zone.entity_id;
                var marker = L.marker(latlng, {
                    icon: L.divIcon({
                        html: '<div class="ys-zone-marker"><span>' + escapeHtml(label) + '</span></div>',
                        className: "ys-leaflet-zone",
                        iconSize: [1, 1],
                        iconAnchor: [0, 0]
                    }),
                    interactive: false,
                    keyboard: false,
                    zIndexOffset: -100
                });
                if (that.state.flags.homepoint) {
                    marker.addTo(that.map);
                }
                var circle = L.circle(latlng, {
                    radius: that._zoneRadius(zone),
                    color: "#16a34a",
                    weight: 1,
                    opacity: 0.7,
                    fillColor: "#16a34a",
                    fillOpacity: 0.06,
                    interactive: false
                });
                if (that.state.flags.homerange) {
                    circle.addTo(that.map);
                }
                that.zoneMarkerLayers.push(marker);
                that.zoneRangeLayers.push(circle);
            })(this.state.zones[i]);
        }
    },

    homerange: function (flag) {
        var show = (flag === undefined || flag === null) ? !this.state.flags.homerange : !!flag;
        this.state.flags.homerange = show;
        for (var i = 0; i < this.zoneRangeLayers.length; i++) {
            if (show) {
                if (!this.map.hasLayer(this.zoneRangeLayers[i])) {
                    this.zoneRangeLayers[i].addTo(this.map);
                }
            } else if (this.map.hasLayer(this.zoneRangeLayers[i])) {
                this.map.removeLayer(this.zoneRangeLayers[i]);
            }
        }
    },

    homepoint: function (flag) {
        var show = (flag === undefined || flag === null) ? !this.state.flags.homepoint : !!flag;
        this.state.flags.homepoint = show;
        for (var i = 0; i < this.zoneMarkerLayers.length; i++) {
            if (show) {
                if (!this.map.hasLayer(this.zoneMarkerLayers[i])) {
                    this.zoneMarkerLayers[i].addTo(this.map);
                }
            } else if (this.map.hasLayer(this.zoneMarkerLayers[i])) {
                this.map.removeLayer(this.zoneMarkerLayers[i]);
            }
        }
    },

    /* ---------------- 设备标记 ---------------- */

    _deviceIcon: function (device) {
        return L.divIcon({
            html: ysMarkerHtml(device.name, device.icon, device.stateInfo),
            className: "ys-leaflet-marker",
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    },

    _addMarker: function (marker) {
        if (this.clusterGroup) {
            this.clusterGroup.addLayer(marker);
        } else {
            marker.addTo(this.map);
        }
    },

    _removeMarker: function (marker) {
        if (this.clusterGroup) {
            this.clusterGroup.removeLayer(marker);
        } else if (this.map.hasLayer(marker)) {
            this.map.removeLayer(marker);
        }
    },

    _drawDevices: function () {
        var that = this;
        for (var entityId in this.state.devices) {
            if (!Object.prototype.hasOwnProperty.call(this.state.devices, entityId)) {
                continue;
            }
            var device = this.state.devices[entityId];
            var marker = L.marker(this._toLatLng({ lon: device.lon, lat: device.lat }), {
                icon: this._deviceIcon(device),
                title: device.name,
                riseOnHover: true,
                keyboard: false
            });
            marker.on("click", (function (id) {
                return function () {
                    openMoreInfo(id);
                };
            })(entityId));
            marker.__ysDevice = device;
            if (device.visible !== false) {
                this._addMarker(marker);
            }
            this.deviceMarkers[entityId] = marker;
            this._updateAccuracyLayer(entityId, device, device.visible !== false);
        }
    },

    drawdevicemarker: function (entityId, labelName, coordinate, icon, stateInfo, accuracy) {
        if (!this.map) {
            return;
        }
        var device = this.state.devices[entityId] || { visible: true };
        device.id = entityId;
        device.name = labelName;
        device.lon = coordinate.lon;
        device.lat = coordinate.lat;
        device.icon = icon || { kind: "default" };
        device.stateInfo = stateInfo || { cls: "zone" };
        device.accuracy = Number(accuracy) || 0;
        var signature = (labelName || "") + "|" + ((stateInfo && stateInfo.cls) || "") + "|" +
            ((icon && (icon.key || "")) || "") + "|" + ((icon && (icon.picture || "")) || "");
        device.signature = signature;

        var marker = this.deviceMarkers[entityId];
        if (marker) {
            marker.setLatLng(this._toLatLng({ lon: coordinate.lon, lat: coordinate.lat }));
            if (marker.__ysSignature !== signature) {
                marker.setIcon(this._deviceIcon(device));
                marker.__ysSignature = signature;
                marker.options.title = labelName;
                if (marker.getElement()) {
                    marker.getElement().setAttribute("title", labelName);
                }
            }
            marker.__ysDevice = device;
        } else {
            marker = L.marker(this._toLatLng({ lon: coordinate.lon, lat: coordinate.lat }), {
                icon: this._deviceIcon(device),
                title: labelName,
                riseOnHover: true,
                keyboard: false
            });
            marker.on("click", (function (id) {
                return function () {
                    openMoreInfo(id);
                };
            })(entityId));
            marker.__ysSignature = signature;
            marker.__ysDevice = device;
            this._addMarker(marker);
            this.deviceMarkers[entityId] = marker;
        }
        this.state.devices[entityId] = device;
        this._updateAccuracyLayer(entityId, device, device.visible !== false);
    },

    _updateAccuracyLayer: function (entityId, device, visible) {
        var accuracy = Number(device.accuracy) || 0;
        var circle = this.accuracyLayers[entityId];
        if (!accuracy) {
            if (circle) {
                this.map.removeLayer(circle);
                delete this.accuracyLayers[entityId];
            }
            return;
        }
        var latlng = this._toLatLng({ lon: device.lon, lat: device.lat });
        if (!circle) {
            circle = L.circle(latlng, {
                radius: accuracy,
                color: "#4da3ff",
                weight: 1,
                opacity: 0.8,
                fillColor: "#4da3ff",
                fillOpacity: 0.08,
                interactive: false
            });
            this.accuracyLayers[entityId] = circle;
        } else {
            circle.setLatLng(latlng);
            circle.setRadius(accuracy);
        }
        if (visible) {
            if (!this.map.hasLayer(circle)) {
                circle.addTo(this.map);
            }
        } else if (this.map.hasLayer(circle)) {
            this.map.removeLayer(circle);
        }
    },

    showdevicemarker: function (entityId, flag) {
        var device = this.state.devices[entityId];
        if (!device) {
            return;
        }
        device.visible = !!flag;
        var marker = this.deviceMarkers[entityId];
        if (!marker) {
            return;
        }
        if (flag) {
            this._addMarker(marker);
        } else {
            this._removeMarker(marker);
        }
        this._updateAccuracyLayer(entityId, device, !!flag);
    },

    updateMarkerClusterer: function () {
        /* Leaflet markercluster 会自动处理 */
    },

    /* ---------------- 视野 / 缩放 ---------------- */

    center: function (coordinate) {
        if (!this.map) {
            return;
        }
        this.map.setView(this._toLatLng(coordinate));
    },

    fitAll: function () {
        if (!this.map) {
            return;
        }
        var bounds = L.latLngBounds([]);
        var added = 0;
        for (var entityId in this.state.devices) {
            if (!Object.prototype.hasOwnProperty.call(this.state.devices, entityId)) {
                continue;
            }
            var d = this.state.devices[entityId];
            if (d.visible !== false) {
                bounds.extend(this._toLatLng({ lon: d.lon, lat: d.lat }));
                added++;
            }
        }
        var home = this._homeZone();
        if (home) {
            bounds.extend(this._toLatLng({ lon: home.longitude, lat: home.latitude }));
            added++;
        }
        if (added > 0) {
            this.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
        }
    },

    fitTrack: function () {
        if (!this.map || !this.trackLayers.line1) {
            return;
        }
        var bounds = this.trackLayers.line1.getBounds();
        if (bounds.isValid()) {
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
        }
    },

    zoomin: function () {
        if (this.map) {
            this.map.zoomIn();
        }
    },

    zoomout: function () {
        if (this.map) {
            this.map.zoomOut();
        }
    },

    iszoomin: function () {
        return !!this.map && this.map.getZoom() < (this.map.getMaxZoom() || 18);
    },

    iszoomout: function () {
        return !!this.map && this.map.getZoom() > (this.map.getMinZoom() || 3);
    },

    /* ---------------- 路况图层 ---------------- */

    _addTrafficTiles: function () {
        var def = this._currentBasemap();
        var url = LEAFLET_TRAFFIC_TILES[def.crs];
        if (!url) {
            return;
        }
        this.trafficLayer = L.tileLayer(url, {
            subdomains: def.subdomains ? def.subdomains.split("") : "abc",
            tms: !!def.tms,
            minZoom: def.minZoom || 3,
            maxZoom: def.maxZoom || 18,
            opacity: 0.85
        });
        this.trafficLayer.addTo(this.map);
    },

    traffic: function (flag) {
        if (!this.map) {
            return;
        }
        var show = (flag === undefined || flag === null) ? !this.state.flags.traffic : !!flag;
        this.state.flags.traffic = show;
        if (show) {
            if (!this.trafficLayer) {
                this._addTrafficTiles();
            } else if (!this.map.hasLayer(this.trafficLayer)) {
                this.trafficLayer.addTo(this.map);
            }
        } else if (this.trafficLayer && this.map.hasLayer(this.trafficLayer)) {
            this.map.removeLayer(this.trafficLayer);
        }
    },

    istraffic: function () {
        return !!this.state.flags.traffic;
    },

    ishomerange: function () {
        return !!this.state.flags.homerange;
    },

    ishomepoint: function () {
        return !!this.state.flags.homepoint;
    },

    /* ---------------- 轨迹回放（支持多设备同时播放） ---------------- */

    query: function (coordinate, iconInfo) {
        this.queryMulti([{
            id: "single",
            name: "",
            points: coordinate || [],
            iconInfo: iconInfo,
            color: "#0022aa"
        }], { fit: true });
    },

    queryMulti: function (tracks, options) {
        if (!this.map || !tracks || !tracks.length) {
            this._clearTrackLayers();
            return;
        }
        var that = this;
        options = options || {};
        this._stopTrackAnimation();
        this._clearTrackLayers();

        var multi = tracks.length > 1;
        var maxPointsPerTrack = multi ? 400 : 800;
        var animTracks = [];
        var bounds = L.latLngBounds([]);
        var totalOriginal = 0;
        var totalDrawn = 0;
        var totalMetersAll = 0;
        var maxBase = 5;
        var palette = ["#1677ff", "#16a34a", "#f59e0b", "#7c3aed", "#dc2626", "#0891b2", "#ea580c", "#db2777"];

        for (var t = 0; t < tracks.length; t++) {
            var track = tracks[t] || {};
            var source = track.points || [];
            if (source.length < 2) {
                continue;
            }
            var original = source.length;
            totalOriginal += original;

            var points = source;
            if (original > maxPointsPerTrack) {
                var step = Math.ceil(original / maxPointsPerTrack);
                points = [];
                for (var i = 0; i < original; i += step) {
                    points.push(source[i]);
                }
                if (points[points.length - 1] !== source[original - 1]) {
                    points.push(source[original - 1]);
                }
            }
            totalDrawn += points.length;

            var color = track.color || palette[t % palette.length];
            var latlngs = [];
            var wgsPath = [];
            var totalMeters = 0;
            var cum = [0];
            for (var k = 0; k < points.length; k++) {
                var p = { lon: points[k].longitude, lat: points[k].latitude };
                if (k > 0) {
                    var seg = YSGeo.distanceMeters(wgsPath[k - 1], p);
                    totalMeters += seg;
                    cum.push(totalMeters);
                }
                wgsPath.push(p);
                latlngs.push(this._toLatLng(p));
            }
            if (latlngs.length < 2) {
                continue;
            }
            totalMetersAll += totalMeters;
            var baseDuration = Math.min(20, Math.max(5, totalMeters / 1000 * 0.5));
            if (baseDuration > maxBase) {
                maxBase = baseDuration;
            }

            var line1 = L.polyline(latlngs, {
                color: color,
                weight: 3,
                opacity: 0.75,
                interactive: false
            }).addTo(this.map);
            var line2 = L.polyline([], {
                color: color,
                weight: 3.5,
                opacity: 0.95,
                interactive: false
            }).addTo(this.map);
            var marker = L.marker(latlngs[0], {
                icon: this._trackMarkerIcon(track.iconInfo, color),
                zIndexOffset: 2000,
                interactive: false,
                keyboard: false
            }).addTo(this.map);

            var anchorPoints = [];
            var anchorGroup = L.layerGroup();
            var tooltipStep = Math.max(1, Math.ceil(points.length / (multi ? 50 : 160)));
            for (var a = 0; a < points.length; a += tooltipStep) {
                anchorPoints.push(points[a]);
            }
            this._fillTrackAnchors(anchorGroup, anchorPoints, color);
            anchorGroup.addTo(this.map);

            bounds.extend(latlngs);
            animTracks.push({
                id: track.id,
                name: track.name || "",
                color: color,
                iconInfo: track.iconInfo || {},
                path: latlngs,
                wgsPath: wgsPath,
                points: points,
                anchorPoints: anchorPoints,
                cum: cum,
                total: Math.max(totalMeters, 0.001),
                baseDuration: baseDuration,
                index: 0,
                distance: 0,
                line1: line1,
                line2: line2,
                marker: marker,
                anchors: anchorGroup
            });
        }

        if (!animTracks.length) {
            this._clearTrackLayers();
            return;
        }

        this.trackAnim = {
            tracks: animTracks,
            baseDuration: maxBase,
            progress: 0,
            running: false,
            paused: false,
            lastTs: null,
            lastLineTs: 0,
            raf: null
        };
        this.lastTrackInfo = {
            original: totalOriginal,
            drawn: totalDrawn,
            totalMeters: Math.round(totalMetersAll),
            durationSec: Math.round(maxBase),
            baseDuration: maxBase,
            count: animTracks.length
        };
        if (bounds.isValid() && options.fit !== false) {
            this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
        }
    },

    _trackMarkerIcon: function (iconInfo, color) {
        return L.divIcon({
            html: ysTrackMarkerHtml(iconInfo, color),
            className: "ys-leaflet-track-marker",
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    },

    _fillTrackAnchors: function (group, points, color) {
        var that = this;
        group.clearLayers();
        for (var i = 0; i < points.length; i++) {
            (function (point) {
                var cm = L.circleMarker(that._toLatLng({ lon: point.longitude, lat: point.latitude }), {
                    radius: 2.5,
                    color: color,
                    weight: 1,
                    fillColor: color,
                    fillOpacity: 0.8,
                    interactive: true
                });
                cm.bindTooltip(point.updatedate || "", {
                    direction: "top",
                    className: "ys-track-tooltip",
                    sticky: true
                });
                group.addLayer(cm);
            })(points[i]);
        }
    },

    _clearTrackLayers: function () {
        var anim = this.trackAnim;
        if (anim && anim.tracks && this.map) {
            for (var i = 0; i < anim.tracks.length; i++) {
                var layers = [anim.tracks[i].line1, anim.tracks[i].line2,
                    anim.tracks[i].marker, anim.tracks[i].anchors];
                for (var j = 0; j < layers.length; j++) {
                    if (layers[j] && this.map.hasLayer(layers[j])) {
                        this.map.removeLayer(layers[j]);
                    }
                }
            }
        }
        this.trackLayers = {};
        this.trackAnim = null;
    },

    _drawTrackStatic: function () {
        var anim = this.trackAnim;
        if (!anim || !anim.tracks || !this.map) {
            return;
        }
        for (var i = 0; i < anim.tracks.length; i++) {
            var tr = anim.tracks[i];
            var latlngs = [];
            for (var k = 0; k < tr.wgsPath.length; k++) {
                latlngs.push(this._toLatLng(tr.wgsPath[k]));
            }
            tr.path = latlngs;
            tr.line1 = L.polyline(latlngs, {
                color: tr.color, weight: 3, opacity: 0.75, interactive: false
            }).addTo(this.map);
            tr.line2 = L.polyline([], {
                color: tr.color, weight: 3.5, opacity: 0.95, interactive: false
            }).addTo(this.map);
            tr.marker = L.marker(latlngs[0], {
                icon: this._trackMarkerIcon(tr.iconInfo, tr.color),
                zIndexOffset: 2000, interactive: false, keyboard: false
            }).addTo(this.map);
            tr.anchors = L.layerGroup();
            this._fillTrackAnchors(tr.anchors, tr.anchorPoints || [], tr.color);
            tr.anchors.addTo(this.map);
            tr.index = 0;
            tr.distance = 0;
        }
        anim.progress = 0;
        anim.running = false;
        anim.paused = false;
    },

    getTrackSpeed: function () {
        return this.trackSpeed || 1;
    },

    setTrackSpeed: function (multiplier) {
        var m = Number(multiplier);
        if (!isFinite(m) || m <= 0) {
            m = 1;
        }
        this.trackSpeed = Math.max(0.25, Math.min(16, m));
    },

    getTrackDuration: function () {
        var anim = this.trackAnim;
        if (!anim) {
            return 0;
        }
        return Math.max(2, anim.baseDuration / (this.trackSpeed || 1));
    },

    /** 把动画进度应用到所有轨迹（marker 位置、已走过的轨迹线） */
    _applyTrackProgress: function (anim, progress, forceLine) {
        for (var i = 0; i < anim.tracks.length; i++) {
            var tr = anim.tracks[i];
            var dist = progress * tr.total;
            tr.distance = dist;
            var idx = tr.index;
            while (idx < tr.cum.length - 2 && tr.cum[idx + 1] <= dist) {
                idx++;
            }
            tr.index = idx;
            var p1 = tr.path[idx];
            var p2 = tr.path[idx + 1];
            if (!p1 || !p2) {
                continue;
            }
            var segStart = tr.cum[idx];
            var segEnd = tr.cum[idx + 1];
            var tt = segEnd > segStart ? (dist - segStart) / (segEnd - segStart) : 0;
            tt = Math.max(0, Math.min(1, tt));
            tr.marker.setLatLng(L.latLng(
                p1.lat + (p2.lat - p1.lat) * tt,
                p1.lng + (p2.lng - p1.lng) * tt
            ));
            if (forceLine || progress >= 1) {
                if (progress >= 1) {
                    tr.line2.setLatLngs(tr.path);
                } else {
                    var passed = tr.path.slice(0, idx + 1);
                    passed.push(tr.marker.getLatLng());
                    tr.line2.setLatLngs(passed);
                }
            }
            if (progress >= 1) {
                tr.marker.setLatLng(tr.path[tr.path.length - 1]);
            }
        }
    },

    /** 取第一条轨迹在当前进度对应的时间戳（毫秒），用于拖动条显示 */
    _seekTs: function (anim, progress) {
        if (!anim || !anim.tracks || !anim.tracks.length) {
            return null;
        }
        var tr = anim.tracks[0];
        if (!tr.points || !tr.points.length) {
            return null;
        }
        var dist = progress * tr.total;
        var idx = 0;
        while (idx < tr.cum.length - 2 && tr.cum[idx + 1] <= dist) {
            idx++;
        }
        if (idx >= tr.points.length) {
            idx = tr.points.length - 1;
        }
        var point = tr.points[idx];
        if (!point || !point.last_updated) {
            return null;
        }
        var ts = Date.parse(point.last_updated);
        return isNaN(ts) ? null : ts;
    },

    /** 拖动进度条：跳转到轨迹的任意位置 */
    seek: function (progress) {
        var anim = this.trackAnim;
        if (!anim || !anim.tracks) {
            return;
        }
        progress = Math.max(0, Math.min(1, Number(progress) || 0));
        this._stopTrackAnimation();
        anim.progress = progress;
        anim.paused = progress > 0 && progress < 1;
        this._applyTrackProgress(anim, progress, true);
        $(document).trigger("trackProgress", [{
            progress: progress,
            ts: this._seekTs(anim, progress)
        }]);
    },

    getTrackProgress: function () {
        return this.trackAnim ? this.trackAnim.progress : 0;
    },

    _trackFrame: function (anim) {
        var that = this;
        if (!anim || !anim.running) {
            return;
        }
        anim.raf = window.requestAnimationFrame(function (ts) {
            if (!anim.running || that.trackAnim !== anim || !that.map) {
                return;
            }
            if (anim.lastTs == null) {
                anim.lastTs = ts;
            }
            var dt = Math.min(250, ts - anim.lastTs);
            anim.lastTs = ts;
            var durationMs = that.getTrackDuration() * 1000;
            if (!(durationMs > 0)) {
                durationMs = 1000;
            }
            anim.progress = Math.min(1, anim.progress + dt / durationMs);
            var progress = anim.progress;
            var updateLine = (progress >= 1) || (ts - anim.lastLineTs > 100);

            that._applyTrackProgress(anim, progress, updateLine);
            if (progress >= 1) {
                anim.lastLineTs = ts;
                anim.running = false;
                anim.paused = false;
                $(document).trigger("trackProgress", [{
                    progress: 1,
                    ts: that._seekTs(anim, 1)
                }]);
                $(document).trigger("trackAnimationEnd");
                return;
            }
            if (updateLine) {
                anim.lastLineTs = ts;
                $(document).trigger("trackProgress", [{
                    progress: progress,
                    ts: that._seekTs(anim, progress)
                }]);
            }
            that._trackFrame(anim);
        });
    },

    _stopTrackAnimation: function () {
        var anim = this.trackAnim;
        if (anim && anim.raf) {
            window.cancelAnimationFrame(anim.raf);
            anim.raf = null;
        }
        if (anim) {
            anim.running = false;
        }
    },

    DrawStart: function () {
        var anim = this.trackAnim;
        if (!anim || !anim.tracks || !anim.tracks.length) {
            return;
        }
        this._stopTrackAnimation();
        anim.progress = 0;
        anim.lastTs = null;
        anim.lastLineTs = 0;
        for (var i = 0; i < anim.tracks.length; i++) {
            var tr = anim.tracks[i];
            tr.index = 0;
            tr.distance = 0;
            tr.line2.setLatLngs([]);
            tr.marker.setLatLng(tr.path[0]);
        }
        anim.running = true;
        anim.paused = false;
        this._trackFrame(anim);
    },

    DrawPause: function () {
        var anim = this.trackAnim;
        if (!anim || !anim.running) {
            return;
        }
        this._stopTrackAnimation();
        anim.paused = true;
    },

    DrawResume: function () {
        var anim = this.trackAnim;
        if (!anim || anim.running || !anim.paused) {
            return;
        }
        anim.paused = false;
        anim.running = true;
        anim.lastTs = null;
        this._trackFrame(anim);
    },

    DrawStop: function () {
        var anim = this.trackAnim;
        if (!anim) {
            return;
        }
        this._stopTrackAnimation();
        anim.progress = 0;
        anim.paused = false;
        for (var i = 0; i < anim.tracks.length; i++) {
            var tr = anim.tracks[i];
            tr.index = 0;
            tr.distance = 0;
            tr.line2.setLatLngs([]);
            tr.marker.setLatLng(tr.path[0]);
        }
    },

    trackplayback: function (flag) {
        var anim = this.trackAnim;
        if (!this.map || !anim || !anim.tracks) {
            return;
        }
        var show = (flag === undefined || flag === null) ? true : !!flag;
        for (var i = 0; i < anim.tracks.length; i++) {
            var tr = anim.tracks[i];
            var layers = [tr.line1, tr.line2, tr.marker, tr.anchors];
            for (var j = 0; j < layers.length; j++) {
                if (!layers[j]) {
                    continue;
                }
                if (show) {
                    if (!this.map.hasLayer(layers[j])) {
                        layers[j].addTo(this.map);
                    }
                } else if (this.map.hasLayer(layers[j])) {
                    this.map.removeLayer(layers[j]);
                }
            }
        }
        if (!show) {
            this._stopTrackAnimation();
            anim.paused = false;
        }
    },

    getTrackInfo: function () {
        return this.lastTrackInfo;
    },

    /* ---------------- 回家路线（高德服务） ---------------- */

    _ensureAmap: function (callback) {
        var that = this;
        if (window.AMap) {
            callback();
            return;
        }
        this._amapCallbacks.push(callback);
        if (this._amapLoading) {
            return;
        }
        this._amapLoading = true;
        if (window.GaodeMapjscode) {
            window._AMapSecurityConfig = { securityJsCode: window.GaodeMapjscode };
        }
        var script = document.createElement("script");
        script.src = "https://webapi.amap.com/maps?v=1.4.15&key=" +
            encodeURIComponent(window.GaodeMapKey || "") +
            "&plugin=AMap.Driving,AMap.Walking,AMap.Riding";
        script.onload = function () {
            var done = function () {
                that._amapLoading = false;
                var callbacks = that._amapCallbacks.slice();
                that._amapCallbacks = [];
                for (var i = 0; i < callbacks.length; i++) {
                    callbacks[i]();
                }
            };
            /* AMap 的插件是异步加载的，等 plugin 回调后再执行 */
            if (window.AMap && typeof window.AMap.plugin === "function") {
                window.AMap.plugin(["AMap.Driving", "AMap.Walking", "AMap.Riding"], done);
            } else {
                done();
            }
        };
        script.onerror = function () {
            that._amapLoading = false;
            that._amapCallbacks = [];
        };
        document.head.appendChild(script);
    },

    _isAtHome: function (device) {
        var home = this._homeZone();
        if (!home) {
            return false;
        }
        var dist = YSGeo.distanceMeters(
            { lon: device.lon, lat: device.lat },
            { lon: home.longitude, lat: home.latitude }
        );
        return dist <= this._zoneRadius(home);
    },

    drawdrivingmarker: function (deviceId, homePoint, tracktype) {
        var that = this;
        var device = this.state.devices[deviceId];
        if (!device || !homePoint) {
            return;
        }
        this.cleardrivingmarker(deviceId);
        if (this._isAtHome(device)) {
            $(document).trigger("updateDrivingState", { deviceId: deviceId, state: "home" });
            return;
        }
        this._ensureAmap(function () {
            var startWgs = { lon: device.lon, lat: device.lat };
            var endWgs = { lon: homePoint.lon, lat: homePoint.lat };
            var startGcj = YSGeo.wgs84ToGcj02(startWgs.lon, startWgs.lat);
            var endGcj = YSGeo.wgs84ToGcj02(endWgs.lon, endWgs.lat);
            var service;
            if (tracktype === "ride") {
                service = new AMap.Riding();
            } else if (tracktype === "walk") {
                service = new AMap.Walking();
            } else {
                service = new AMap.Driving({ policy: AMap.DrivingPolicy ? AMap.DrivingPolicy.LEAST_TIME : 0 });
            }
            service.search(new AMap.LngLat(startGcj[0], startGcj[1]), new AMap.LngLat(endGcj[0], endGcj[1]), function (status, result) {
                if (status !== "complete" || !result || !result.routes || !result.routes.length) {
                    return;
                }
                var route = result.routes[0];
                var gcjPath = [];
                for (var i = 0; i < route.steps.length; i++) {
                    var step = route.steps[i];
                    for (var j = 0; j < step.path.length; j++) {
                        gcjPath.push({ lng: step.path[j].lng, lat: step.path[j].lat });
                    }
                }
                that.state.routes[deviceId] = {
                    gcjPath: gcjPath,
                    time: route.time,
                    tracktype: tracktype
                };
                that._drawRoute(deviceId);
                $(document).trigger("updateDrivingTime", { deviceId: deviceId, time: route.time });
            });
        });
    },

    _drawRoute: function (deviceId) {
        var route = this.state.routes[deviceId];
        if (!route || !this.map) {
            return;
        }
        this.cleardrivingmarker(deviceId, true);
        var latlngs = [];
        for (var i = 0; i < route.gcjPath.length; i++) {
            latlngs.push(this._toLatLngGcj(route.gcjPath[i]));
        }
        var colors = { drive: "#1677ff", ride: "#22c55e", walk: "#f59e0b" };
        var line = L.polyline(latlngs, {
            color: colors[route.tracktype] || "#1677ff",
            weight: 5,
            opacity: 0.85,
            lineJoin: "round",
            interactive: false
        }).addTo(this.map);
        var halo = L.polyline(latlngs, {
            color: "#ffffff",
            weight: 8,
            opacity: 0.35,
            interactive: false
        });
        halo.addTo(this.map);
        this.routeLayers[deviceId] = L.layerGroup([halo, line]).addTo(this.map);
    },

    cleardrivingmarker: function (deviceId, keepState) {
        var layer = this.routeLayers[deviceId];
        if (layer) {
            if (this.map && this.map.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }
            delete this.routeLayers[deviceId];
        }
        if (!keepState) {
            delete this.state.routes[deviceId];
        }
    },

    drawdrivingmarkerShow: function (flag) {
        this._routesVisible = !!flag;
        if (flag) {
            for (var entityId in this.state.routes) {
                if (Object.prototype.hasOwnProperty.call(this.state.routes, entityId)) {
                    this._drawRoute(entityId);
                }
            }
        } else {
            for (var id in this.routeLayers) {
                if (Object.prototype.hasOwnProperty.call(this.routeLayers, id) && this.map.hasLayer(this.routeLayers[id])) {
                    this.map.removeLayer(this.routeLayers[id]);
                }
            }
            this.routeLayers = {};
        }
    },

    _drawRoutes: function () {
        if (!this._routesVisible) {
            return;
        }
        for (var entityId in this.state.routes) {
            if (Object.prototype.hasOwnProperty.call(this.state.routes, entityId)) {
                this._drawRoute(entityId);
            }
        }
    },

    /* ---------------- 多设备历史轨迹 ---------------- */

    setHistoryPaths: function (paths) {
        this.state.history = paths || [];
        this._drawHistory();
    },

    clearHistoryPaths: function () {
        this.state.history = [];
        this._drawHistory();
    },

    _drawHistory: function () {
        var that = this;
        for (var i = 0; i < this.historyLayers.length; i++) {
            if (this.map && this.map.hasLayer(this.historyLayers[i])) {
                this.map.removeLayer(this.historyLayers[i]);
            }
        }
        this.historyLayers = [];
        if (!this.map || !this.state.history || !this.state.history.length) {
            return;
        }
        for (var p = 0; p < this.state.history.length; p++) {
            (function (path) {
                var points = path.points || [];
                if (points.length < 2) {
                    return;
                }
                var latlngs = [];
                for (var j = 0; j < points.length; j++) {
                    latlngs.push(that._toLatLng({ lon: points[j].lon, lat: points[j].lat }));
                }
                /* 分段渐隐（少量分段，避免过多图层造成卡顿） */
                var chunks = Math.min(8, Math.max(1, Math.floor(points.length / 20)));
                var chunkSize = Math.ceil(latlngs.length / chunks);
                for (var c = 0; c < chunks; c++) {
                    var start = c * chunkSize;
                    var end = Math.min(latlngs.length - 1, start + chunkSize);
                    if (start >= end) {
                        continue;
                    }
                    var slice = latlngs.slice(start, end + 1);
                    var opacity = 0.2 + 0.6 * ((c + 1) / chunks);
                    var line = L.polyline(slice, {
                        color: path.color || "#1677ff",
                        weight: 4,
                        opacity: opacity,
                        lineJoin: "round",
                        interactive: false
                    }).addTo(that.map);
                    that.historyLayers.push(line);
                }
                /* 时间提示点（限制数量） */
                var step = Math.max(1, Math.ceil(points.length / 24));
                for (var k = 0; k < points.length; k += step) {
                    var cm = L.circleMarker(latlngs[k], {
                        radius: 2.2,
                        color: path.color || "#1677ff",
                        weight: 1,
                        fillColor: path.color || "#1677ff",
                        fillOpacity: 0.85,
                        interactive: true
                    });
                    cm.bindTooltip(points[k].time || "", {
                        direction: "top",
                        className: "ys-track-tooltip",
                        sticky: true
                    });
                    cm.addTo(that.map);
                    that.historyLayers.push(cm);
                }
            })(this.state.history[p]);
        }
    }
};
