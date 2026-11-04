/**
 * 云尚（高德）地图 - 高德地图实现
 */
function MapGaode() {
    this.map = null;
    this.trafficLayer = null;
    this.homerangeLayer = null;
    this.homerangeLayerArr = new Array();
    this.homepointLayer = null;
    this.homepointLayerArr = new Array();
    this.devicesLayer = {};
    this.devicesDrivingLayer = {};
    this.devicesAccuracyLayer = {};
    this.markerClusterer = null;
    this.homeWindow = null;
    this.trackPlaybackLayer = null;
    this.trackPlaybackLine1 = null;
    this.trackPlaybackLine2 = null;
    this.trackPlaybackMass1 = null;
    this.trackPlaybackMass2 = null;
    this.DrawlineArr = [];
    this.trackAnim = null;
    this.lastTrackInfo = null;
    this.lastTrackOriginal = 0;
    this.trackSpeed = 1;
}

ZOOM = query.get('zoom') || 15;

MapGaode.prototype = {
    init: function (coordinate, zone) {
        var that = this;

        AMapUI.loadUI(['overlay/SimpleMarker'], function (SimpleMarker) {
            AMap.SimpleMarker = SimpleMarker;

            var cCoordinate = that.getCustomCoordinate(coordinate);
            that.map = new AMap.Map('mapContainer', {
                resizeEnable: true,
                zoom: ZOOM,
                center: [cCoordinate.lon, cCoordinate.lat]
            });

            /* 按当前主题设置底图样式，避免深色模式下先闪一下浅色地图 */
            try {
                var resolved = (window.YunshangTheme ? window.YunshangTheme.resolve() : "light");
                that.map.setMapStyle(resolved === "dark" ? "amap://styles/dark" : "amap://styles/normal");
            } catch (e) {
                /* 高德 Key 不正确时忽略 */
            }

            /* 只在缩放结束时通知外部刷新工具栏，避免缩放过程中逐帧刷新图标造成卡顿 */
            that.map.on('zoomend', function () {
                $(document).trigger('mapzoomend');
            });

            that.map.addControl(new AMap.Scale());
            that.map.addControl(new AMap.MapType());

            /* 实时路况图层 */
            that.trafficLayer = new AMap.TileLayer.Traffic({
                map: that.map,
                zIndex: 4
            });
            that.traffic(false);

            /* 家的位置与区域围栏 */
            var vhomepointLayerArr = new Array();
            var vhomerangeLayerArr = new Array();
            $.each(zone, function (i, n) {
                var cZone = that.getCustomCoordinate({ 'lon': n.longitude, 'lat': n.latitude });

                var vhomepointLayer = new AMap.SimpleMarker({
                    map: that.map,
                    iconLabel: n.friendly_name,
                    iconTheme: 'default',
                    iconStyle: 'green',
                    position: [cZone.lon, cZone.lat]
                });
                vhomepointLayerArr.push(vhomepointLayer);

                var vhomerangeLayer = new AMap.Circle({
                    map: that.map,
                    center: [cZone.lon, cZone.lat],
                    radius: n.radius,
                    fillOpacity: 0.2,
                    strokeWeight: 1
                });
                vhomerangeLayerArr.push(vhomerangeLayer);

                if (n.entity_id == "zone.home") {
                    that.homepointLayer = vhomepointLayer;
                    that.homerangeLayer = vhomerangeLayer;
                }
            });
            that.homepointLayerArr = vhomepointLayerArr;
            that.homerangeLayerArr = vhomerangeLayerArr;
            that.homerange(true);
            that.homepoint(true);

            /* 设备标记聚合 */
            var sts = [{
                url: "images/blue.png",
                size: new AMap.Size(32, 32),
                offset: new AMap.Pixel(-16, -16)
            }];
            that.markerClusterer = new AMap.MarkerClusterer(
                that.map,
                [], {
                styles: sts,
                gridSize: 20,
                zoomOnClick: true
            });
            that.markerClusterer.on('click', function (data) {
                var markers = data.markers;
                var lnglat = data.lnglat;
                if (that.homerangeLayer && that.homerangeLayer.contains(lnglat)) {
                    var info = [];
                    info.push('<div class="ys-home-window"><div class="ys-home-window-title">' +
                        t("homeDevices") + '</div><ul class="ys-home-window-list">');
                    for (var deviceId in that.devicesLayer) {
                        if (that.devicesLayer[deviceId].visible) {
                            if (that.homerangeLayer.contains(that.devicesLayer[deviceId].getPosition())) {
                                info.push('<li data-entity-id="device_tracker.' + deviceId + '">' +
                                    escapeHtml(that.devicesLayer[deviceId].__ysName || deviceId) + '</li>');
                            }
                        }
                    }
                    info.push('</ul></div>');
                    that.homeWindow = new AMap.InfoWindow({
                        content: info.join(''),
                        offset: new AMap.Pixel(0, -8)
                    });
                    that.homeWindow.open(that.map, markers && markers.length ? markers[0].getPosition() : lnglat);
                    /* 在家设备列表：点击后打开实体详情 */
                    setTimeout(function () {
                        var nodes = document.querySelectorAll('.ys-home-window-list li');
                        for (var i = 0; i < nodes.length; i++) {
                            nodes[i].addEventListener('click', function () {
                                openMoreInfo(this.getAttribute('data-entity-id'));
                                that.homeWindow.close();
                            });
                        }
                    }, 0);
                }
            });

            $(document).trigger('mapInitFinished');
        });
    },

    query: function (coordinate) {
        if (!coordinate || coordinate.length === 0) {
            return;
        }
        /* 轨迹点过多会造成缩放/平移卡顿：按最多 800 个点抽样显示（保留首尾点） */
        var original = coordinate.length;
        var maxPoints = 800;
        if (original > maxPoints) {
            var step = Math.ceil(original / maxPoints);
            var sampled = [];
            for (var i = 0; i < original; i += step) {
                sampled.push(coordinate[i]);
            }
            if (sampled[sampled.length - 1] !== coordinate[original - 1]) {
                sampled.push(coordinate[original - 1]);
            }
            coordinate = sampled;
        }
        this.lastTrackOriginal = original;
        this.drawTrackPlaybackmarker(coordinate);
    },

    drawTrackPlaybackmarker: function (coordinate) {
        if (null == this.map || !coordinate || coordinate.length === 0) {
            return;
        }
        var that = this;

        var cCoordinate = new Array();
        $.each(coordinate, function (i, n) {
            var cPosition = that.getCustomCoordinate({ 'lon': n.longitude, 'lat': n.latitude });
            var updatedate = (n.lastseen ? "最后出现：" + n.lastseen + "<br/>" : "") +
                (n.latest_report_time ? "上报时间：" + n.latest_report_time + "<br/>记录时间：" : "") +
                (n.last_updated ? "" + getDatetime(n.last_updated) : "");
            cCoordinate.push({
                'longitude': cPosition.lon,
                'latitude': cPosition.lat,
                'updatedate': updatedate,
                'lnglat': [cPosition.lon, cPosition.lat]
            });
        });

        /* 先清理上一次的轨迹 */
        this.trackPlaybackClear();

        var lineArr = [];
        that.trackPlaybackLayer = new AMap.Marker({
            map: that.map,
            position: [cCoordinate[0].longitude, cCoordinate[0].latitude],
            icon: "images/car.png",
            offset: new AMap.Pixel(-20, -7),
            zIndex: 120
        });

        lineArr.push(new AMap.LngLat(cCoordinate[0].longitude, cCoordinate[0].latitude));
        $.each(cCoordinate, function (i, n) {
            lineArr.push(new AMap.LngLat(n.longitude, n.latitude));
        });

        that.trackPlaybackLine1 = new AMap.Polyline({
            map: that.map,
            path: lineArr,
            strokeColor: "#00A",
            strokeWeight: 3,
            zIndex: 111
        });
        that.trackPlaybackLine2 = new AMap.Polyline({
            map: that.map,
            strokeColor: "#F00",
            strokeWeight: 3,
            zIndex: 112
        });

        that.DrawlineArr = lineArr;

        /* 自定义轨迹动画数据：按路径长度均匀分配时间，支持速度倍率与平滑调整 */
        var pathPts = [];
        for (var pi = 0; pi < cCoordinate.length; pi++) {
            pathPts.push({ lng: cCoordinate[pi].longitude, lat: cCoordinate[pi].latitude });
        }
        var cum = [0];
        var totalMeters = 0;
        for (var ci = 1; ci < pathPts.length; ci++) {
            totalMeters += that._distanceMeters(pathPts[ci - 1], pathPts[ci]);
            cum.push(totalMeters);
        }
        that.trackAnim = {
            path: pathPts,
            cum: cum,
            total: Math.max(totalMeters, 0.001),
            lngLatPath: lineArr,
            index: 0,
            distance: 0,
            running: false,
            paused: false,
            lastTs: null,
            lastLineTs: 0,
            raf: null,
            baseDuration: Math.min(20, Math.max(5, totalMeters / 1000 * 0.5)),
            speedMps: 0
        };
        that.lastTrackInfo = {
            original: that.lastTrackOriginal,
            drawn: pathPts.length,
            totalMeters: Math.round(totalMeters),
            durationSec: Math.round(that.trackAnim.baseDuration),
            baseDuration: that.trackAnim.baseDuration
        };
        that.map.setFitView();

        /* 让动画从起点开始 */
        that.trackPlaybackLayer.setPosition([pathPts[0].lng, pathPts[0].lat]);

        /* 轨迹锚点样式 */
        var style = [{
            url: 'images/mass0.png',
            anchor: new AMap.Pixel(6, 6),
            size: new AMap.Size(11, 11)
        }, {
            url: 'images/mass1.png',
            anchor: new AMap.Pixel(4, 4),
            size: new AMap.Size(7, 7)
        }, {
            url: 'images/mass2.png',
            anchor: new AMap.Pixel(3, 3),
            size: new AMap.Size(5, 5)
        }];

        that.trackPlaybackMass1 = new AMap.MassMarks(cCoordinate, {
            opacity: 0.8,
            zIndex: 5,
            cursor: 'pointer',
            style: style[0]
        });

        that.trackPlaybackMass2 = new AMap.Marker({ content: ' ', map: that.map });

        var isTouchDevice = 'ontouchstart' in window || navigator.msMaxTouchPoints;
        if (isTouchDevice) {
            that.trackPlaybackMass1.on('touchstart', function (e) {
                that.trackPlaybackMass2.setPosition(e.data.lnglat);
                that.trackPlaybackMass2.setLabel({ content: e.data.updatedate });
            });
        } else {
            that.trackPlaybackMass1.on('mouseover', function (e) {
                that.trackPlaybackMass2.setPosition(e.data.lnglat);
                that.trackPlaybackMass2.setLabel({ content: e.data.updatedate });
            });
        }
        that.trackPlaybackMass1.setMap(that.map);
    },

    /** 清理轨迹与动画 */
    trackPlaybackClear: function () {
        this._stopTrackAnimation();
        this.trackAnim = null;
        if (this.trackPlaybackLayer) {
            this.trackPlaybackLayer.setMap(null);
            this.trackPlaybackLayer = null;
        }
        if (this.trackPlaybackLine1) {
            this.trackPlaybackLine1.setMap(null);
            this.trackPlaybackLine1 = null;
        }
        if (this.trackPlaybackLine2) {
            this.trackPlaybackLine2.setMap(null);
            this.trackPlaybackLine2 = null;
        }
        if (this.trackPlaybackMass1) {
            this.trackPlaybackMass1.setMap(null);
            this.trackPlaybackMass1 = null;
        }
        if (this.trackPlaybackMass2) {
            this.trackPlaybackMass2.setMap(null);
            this.trackPlaybackMass2 = null;
        }
        this.DrawlineArr = [];
    },

    /* —— 轨迹动画：自绘 rAF 动画，速度可实时调整 —— */

    _distanceMeters: function (a, b) {
        var R = 6371000;
        var rad = Math.PI / 180;
        var dLat = (b.lat - a.lat) * rad;
        var dLng = (b.lng - a.lng) * rad;
        var x = dLng * Math.cos((a.lat + b.lat) / 2 * rad);
        return Math.sqrt(dLat * dLat + x * x) * R;
    },

    /** 当前速度倍率 */
    getTrackSpeed: function () {
        return this.trackSpeed || 1;
    },

    /** 设置速度倍率（0.25 ~ 16），动画中调整会立即平滑生效 */
    setTrackSpeed: function (multiplier) {
        var m = Number(multiplier);
        if (!isFinite(m) || m <= 0) {
            m = 1;
        }
        this.trackSpeed = Math.max(0.25, Math.min(16, m));
    },

    /** 按当前速度倍率计算的动画总时长（秒） */
    getTrackDuration: function () {
        var anim = this.trackAnim;
        if (!anim) {
            return 0;
        }
        return Math.max(2, anim.baseDuration / (this.trackSpeed || 1));
    },

    _trackFrame: function (anim) {
        var that = this;
        if (!anim || !anim.running) {
            return;
        }
        anim.raf = window.requestAnimationFrame(function (ts) {
            if (!anim.running || that.trackAnim !== anim) {
                return;
            }
            if (anim.lastTs == null) {
                anim.lastTs = ts;
            }
            var dt = Math.min(250, ts - anim.lastTs);
            anim.lastTs = ts;
            anim.speedMps = anim.total / that.getTrackDuration();
            anim.distance += anim.speedMps * dt / 1000;

            var total = anim.total;
            var done = anim.distance >= total;
            var dist = done ? total : anim.distance;

            var i = anim.index;
            while (i < anim.cum.length - 2 && anim.cum[i + 1] <= dist) {
                i++;
            }
            anim.index = i;
            var segStart = anim.cum[i];
            var segEnd = anim.cum[i + 1];
            var t = segEnd > segStart ? (dist - segStart) / (segEnd - segStart) : 0;
            if (t < 0) {
                t = 0;
            } else if (t > 1) {
                t = 1;
            }
            var p1 = anim.path[i];
            var p2 = anim.path[i + 1];
            if (!p1 || !p2) {
                anim.running = false;
                return;
            }
            var lng = p1.lng + (p2.lng - p1.lng) * t;
            var lat = p1.lat + (p2.lat - p1.lat) * t;

            that.trackPlaybackLayer.setPosition([lng, lat]);
            try {
                var bearing = Math.atan2(
                    (p2.lng - p1.lng) * Math.cos(lat * Math.PI / 180),
                    (p2.lat - p1.lat)
                ) * 180 / Math.PI;
                bearing = ((bearing % 360) + 360) % 360;
                that.trackPlaybackLayer.setAngle(bearing);
            } catch (e) {
                /* 忽略不支持旋转的情况 */
            }

            /* 已走过的轨迹线：节流更新，避免每帧重建大数组 */
            if (done || ts - anim.lastLineTs > 100) {
                anim.lastLineTs = ts;
                var passed = [];
                for (var k = 0; k <= i; k++) {
                    passed.push([anim.path[k].lng, anim.path[k].lat]);
                }
                passed.push([lng, lat]);
                that.trackPlaybackLine2.setPath(passed);
            }

            if (done) {
                anim.running = false;
                anim.paused = false;
                anim.distance = total;
                that.trackPlaybackLayer.setPosition([anim.path[anim.path.length - 1].lng, anim.path[anim.path.length - 1].lat]);
                that.trackPlaybackLine2.setPath(anim.lngLatPath);
                return;
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
        if (!anim || !anim.path || anim.path.length < 2 || !this.trackPlaybackLayer) {
            return;
        }
        this._stopTrackAnimation();
        anim.running = true;
        anim.paused = false;
        anim.distance = 0;
        anim.index = 0;
        anim.lastTs = null;
        anim.lastLineTs = 0;
        this.trackPlaybackLayer.setPosition([anim.path[0].lng, anim.path[0].lat]);
        if (this.trackPlaybackLine2) {
            this.trackPlaybackLine2.setPath([]);
        }
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
        this._stopTrackAnimation();
        if (this.trackAnim) {
            this.trackAnim.paused = false;
        }
    },

    getStandardCoordinate: function (coordinate) {
        return coordinateutil.gcj_decrypt(coordinate.lat, coordinate.lon);
    },

    getCustomCoordinate: function (coordinate) {
        return coordinateutil.gcj_encrypt(coordinate.lat, coordinate.lon);
    },

    center: function (coordinate) {
        var cCoordinate = this.getCustomCoordinate(coordinate);
        this.map.setCenter([cCoordinate.lon, cCoordinate.lat]);
    },

    /* —— 设备标记：优先显示图标 —— */
    drawdevicemarker: function (deviceid, lableName, coordinate, icon, stateInfo, accuracy) {
        if (null == this.map) {
            return;
        }
        var cCoordinate = this.getCustomCoordinate(coordinate);
        var contentHtml = ysMarkerHtml(lableName, icon, stateInfo);
        var key = (lableName || "") + "|" + ((stateInfo && stateInfo.cls) || "") + "|" +
            ((icon && (icon.key || "")) || "") + "|" + ((icon && (icon.picture || "")) || "");

        var marker = this.devicesLayer[deviceid];
        if (marker) {
            marker.setPosition([cCoordinate.lon, cCoordinate.lat]);
            if (marker.__ysKey !== key) {
                marker.setContent(contentHtml);
                marker.__ysKey = key;
                marker.__ysName = lableName;
                marker.setTitle(lableName || "");
            }
        } else {
            marker = new AMap.Marker({
                map: this.map,
                position: [cCoordinate.lon, cCoordinate.lat],
                content: contentHtml,
                offset: new AMap.Pixel(-20, -20),
                zIndex: 120,
                title: lableName || ""
            });
            marker.__ysKey = key;
            marker.__ysName = lableName;
            marker.visible = true;
            marker.on('click', (function () {
                openMoreInfo('device_tracker.' + deviceid);
            }).bind(this));
            this.devicesLayer[deviceid] = marker;
            this.updateMarkerClusterer();
        }

        /* GPS 精度圈（借鉴 map-card 的 gps_accuracy 显示） */
        this.updateAccuracyCircle(deviceid, cCoordinate, accuracy, marker.visible);
    },

    updateAccuracyCircle: function (deviceid, cCoordinate, accuracy, visible) {
        if (null == this.map) {
            return;
        }
        var radius = Number(accuracy);
        if (!isFinite(radius) || radius <= 0) {
            var existing = this.devicesAccuracyLayer[deviceid];
            if (existing) {
                existing.setMap(null);
                delete this.devicesAccuracyLayer[deviceid];
            }
            return;
        }
        var circle = this.devicesAccuracyLayer[deviceid];
        if (!circle) {
            circle = new AMap.Circle({
                map: this.map,
                center: [cCoordinate.lon, cCoordinate.lat],
                radius: radius,
                strokeColor: "#4da3ff",
                strokeWeight: 1,
                strokeOpacity: 0.9,
                fillColor: "#4da3ff",
                fillOpacity: 0.08,
                zIndex: 90,
                bubble: true
            });
            this.devicesAccuracyLayer[deviceid] = circle;
        } else {
            circle.setCenter([cCoordinate.lon, cCoordinate.lat]);
            circle.setRadius(radius);
        }
        if (visible === false) {
            circle.hide();
        } else {
            circle.show();
        }
    },

    /** 适配视野：显示所有可见设备与家的位置 */
    fitAll: function () {
        if (null == this.map) {
            return;
        }
        var overlays = [];
        for (var deviceid in this.devicesLayer) {
            if (this.devicesLayer[deviceid].visible) {
                overlays.push(this.devicesLayer[deviceid]);
            }
        }
        if (this.homepointLayer) {
            overlays.push(this.homepointLayer);
        }
        if (overlays.length > 0) {
            this.map.setFitView(overlays, false, [80, 80, 110, 80], 17);
        }
    },

    /** 适配视野：聚焦当前轨迹 */
    fitTrack: function () {
        if (null == this.map) {
            return;
        }
        var overlays = [];
        if (this.trackPlaybackLine1) {
            overlays.push(this.trackPlaybackLine1);
        }
        if (this.trackPlaybackLayer) {
            overlays.push(this.trackPlaybackLayer);
        }
        if (overlays.length > 0) {
            this.map.setFitView(overlays, false, [70, 70, 100, 70], 17);
        }
    },

    updateMarkerClusterer: function () {
        if (!this.markerClusterer) {
            return;
        }
        var markers = [];
        for (var deviceid in this.devicesLayer) {
            if (this.devicesLayer[deviceid].visible) {
                markers.push(this.devicesLayer[deviceid]);
            }
        }
        this.markerClusterer.setMarkers(markers);
    },

    showdevicemarker: function (deviceid, flag) {
        if (this.devicesLayer[deviceid]) {
            if (flag) {
                this.devicesLayer[deviceid].show();
                this.devicesLayer[deviceid].visible = true;
            } else {
                this.devicesLayer[deviceid].hide();
                this.devicesLayer[deviceid].visible = false;
            }
            var accuracyCircle = this.devicesAccuracyLayer[deviceid];
            if (accuracyCircle) {
                if (flag) {
                    accuracyCircle.show();
                } else {
                    accuracyCircle.hide();
                }
            }
            this.updateMarkerClusterer();
        }
    },

    drawdrivingmarker: function (deviceid, coordinate, tracktype) {
        var that = this;
        if (null == this.devicesLayer[deviceid]) {
            return;
        }
        if (null == coordinate) {
            return;
        }
        var cCoordinate = this.getCustomCoordinate(coordinate);
        var c = this.devicesLayer[deviceid].getPosition();
        if (this.devicesDrivingLayer[deviceid]) {
            this.devicesDrivingLayer[deviceid].clear();
        }
        if (!c) {
            return;
        }

        if (that.homerangeLayer && that.homerangeLayer.contains([c.lng, c.lat])) {
            $(document).trigger('updateDrivingState', { 'deviceId': deviceid, 'state': 'home' });
        } else {
            if (tracktype == "ride") { // 骑行
                this.devicesDrivingLayer[deviceid] = new AMap.Riding({
                    map: this.devicesLayer[deviceid].visible ? that.map : null,
                    hideMarkers: true,
                    autoFitView: false
                });
            } else if (tracktype == "walk") { // 步行
                this.devicesDrivingLayer[deviceid] = new AMap.Walking({
                    map: this.devicesLayer[deviceid].visible ? that.map : null,
                    hideMarkers: true,
                    autoFitView: false
                });
            } else { // 驾车
                this.devicesDrivingLayer[deviceid] = new AMap.Driving({
                    map: this.devicesLayer[deviceid].visible ? that.map : null,
                    hideMarkers: true,
                    autoFitView: false
                });
            }

            this.devicesDrivingLayer[deviceid].search([c.lng, c.lat], [cCoordinate.lon, cCoordinate.lat]);
            this.devicesDrivingLayer[deviceid].on('complete', function (DrivingResult) {
                if (null == DrivingResult || null == DrivingResult.routes) {
                    return;
                }
                var sum = 0;
                for (var index in DrivingResult.routes) {
                    sum += DrivingResult.routes[index].time;
                }
                $(document).trigger('updateDrivingTime', { 'deviceId': deviceid, 'time': sum });
            });
        }
    },

    cleardrivingmarker: function (deviceid) {
        if (this.devicesDrivingLayer[deviceid]) {
            this.devicesDrivingLayer[deviceid].clear();
        }
    },

    drawdrivingmarkerShow: function (flag) {
        if (null == this.map) {
            return;
        }
        if (!flag) {
            $.each(this.devicesDrivingLayer, function (i, n) {
                n.clear();
            });
        }
    },

    zoomin: function () {
        if (null == this.map) {
            return;
        }
        if (this.map.getZoom() >= 18) {
            return;
        }
        this.map.zoomIn();
    },

    zoomout: function () {
        if (null == this.map) {
            return;
        }
        if (this.map.getZoom() <= 3) {
            return;
        }
        this.map.zoomOut();
    },

    traffic: function (flag) {
        if (null == this.map || null == this.trafficLayer) {
            return;
        }
        if (null == flag) {
            if (this.trafficLayer.visible) {
                this.trafficLayer.hide();
                this.trafficLayer.visible = false;
            } else {
                this.trafficLayer.show();
                this.trafficLayer.visible = true;
            }
        } else {
            if (flag) {
                this.trafficLayer.show();
                this.trafficLayer.visible = true;
            } else {
                this.trafficLayer.hide();
                this.trafficLayer.visible = false;
            }
        }
    },

    homerange: function (flag) {
        if (null == this.map || null == this.homerangeLayer) {
            return;
        }
        var show = (flag == null) ? !this.homerangeLayer.visible : !!flag;
        $.each(this.homerangeLayerArr, function (i, n) {
            if (show) {
                n.show();
                n.visible = true;
            } else {
                n.hide();
                n.visible = false;
            }
        });
    },

    homepoint: function (flag) {
        if (null == this.map || null == this.homepointLayer) {
            return;
        }
        var show = (flag == null) ? !this.homepointLayer.visible : !!flag;
        $.each(this.homepointLayerArr, function (i, n) {
            if (show) {
                n.show();
                n.visible = true;
            } else {
                n.hide();
                n.visible = false;
            }
        });
    },

    iszoomin: function () {
        if (null == this.map) {
            return false;
        }
        return this.map.getZoom() < 18;
    },

    iszoomout: function () {
        if (null == this.map) {
            return false;
        }
        return this.map.getZoom() > 3;
    },

    istraffic: function () {
        if (null == this.map || null == this.trafficLayer) {
            return false;
        }
        return !!this.trafficLayer.visible;
    },

    ishomerange: function () {
        if (null == this.map || null == this.homerangeLayer) {
            return false;
        }
        return !!this.homerangeLayer.visible;
    },

    ishomepoint: function () {
        if (null == this.map || null == this.homepointLayer) {
            return false;
        }
        return !!this.homepointLayer.visible;
    },

    trackplayback: function (flag) {
        if (null == this.map || null == this.trackPlaybackLayer) {
            return;
        }
        var that = this;
        var setVisible = function (visible) {
            that.trackPlaybackLayer.visible = visible;
            that.trackPlaybackLine1.visible = visible;
            that.trackPlaybackLine2.visible = visible;
            that.trackPlaybackMass1.visible = visible;
            that.trackPlaybackMass2.visible = visible;
            if (visible) {
                that.trackPlaybackLayer.show();
                that.trackPlaybackLine1.show();
                that.trackPlaybackLine2.show();
                that.trackPlaybackMass1.show();
                that.trackPlaybackMass2.show();
            } else {
                that.trackPlaybackLayer.hide();
                that.trackPlaybackLine1.hide();
                that.trackPlaybackLine2.hide();
                that.trackPlaybackMass1.hide();
                that.trackPlaybackMass2.hide();
            }
        };
        if (null == flag) {
            setVisible(!this.trackPlaybackLayer.visible);
        } else {
            setVisible(!!flag);
        }
    }
};
