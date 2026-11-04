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
    this.markerClusterer = null;
    this.homeWindow = null;
    this.trackPlaybackLayer = null;
    this.trackPlaybackLine1 = null;
    this.trackPlaybackLine2 = null;
    this.trackPlaybackMass1 = null;
    this.trackPlaybackMass2 = null;
    this.DrawlineArr = [];
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

            that.map.on('zoomchange', function () {
                $(document).trigger('zoomchange');
            });

            that.map.on('zoomend', function () {
                if (that.trackPlaybackLine1) {
                    var path = that.trackPlaybackLine1.getPath();
                    that.trackPlaybackLine1.setPath(path);
                }
                if (that.trackPlaybackLine2) {
                    var path = that.trackPlaybackLine2.getPath();
                    that.trackPlaybackLine2.setPath(path);
                }
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
            cCoordinate.push({
                'longitude': cPosition.lon,
                'latitude': cPosition.lat,
                'updatedate': n.updatedate,
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
            autoRotation: true,
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

        that.trackPlaybackLayer.on('moving', function (e) {
            that.trackPlaybackLine2.setPath(e.passedPath);
        });
        that.map.setFitView();

        that.DrawlineArr = lineArr;

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

    DrawStart: function () {
        if (!this.trackPlaybackLayer || !this.DrawlineArr.length) {
            return;
        }
        this.trackPlaybackLayer.moveAlong(this.DrawlineArr, 1000);
    },

    DrawPause: function () {
        if (!this.trackPlaybackLayer) {
            return;
        }
        this.trackPlaybackLayer.pauseMove();
    },

    DrawResume: function () {
        if (!this.trackPlaybackLayer) {
            return;
        }
        this.trackPlaybackLayer.resumeMove();
    },

    DrawStop: function () {
        if (!this.trackPlaybackLayer) {
            return;
        }
        this.trackPlaybackLayer.stopMove();
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
    drawdevicemarker: function (deviceid, lableName, coordinate, icon, stateInfo) {
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
