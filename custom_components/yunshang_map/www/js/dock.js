/**
 * 云尚（高德）地图 - 底部工具栏（dock）
 * 鼠标靠近时图标轻微放大（仅作用于 dock 内的图标）。
 */
(function () {
    "use strict";

    function initDock() {
        var dock = document.getElementById("dock");
        if (!dock) {
            return;
        }
        var images = Array.prototype.slice.call(dock.getElementsByTagName("img"));
        if (!images.length) {
            return;
        }

        var BASE = 42;   // 图标基准尺寸（px）
        var MAX = 1.16;  // 最大放大倍数
        var MIN = 0.72;  // 最小缩放倍数
        var RADIUS = 190;

        var ticking = false;
        var lastEvent = null;

        function apply(ev) {
            ticking = false;
            var dockRect = dock.getBoundingClientRect();
            for (var i = 0; i < images.length; i++) {
                var img = images[i];
                var rect = img.getBoundingClientRect();
                var cx = rect.left + rect.width / 2;
                var cy = rect.top + rect.height / 2;
                var dx = cx - ev.clientX;
                var dy = cy - ev.clientY;
                var dist = Math.sqrt(dx * dx + dy * dy);
                var ratio = dist / RADIUS;
                if (ratio > 1) {
                    ratio = 1;
                }
                var scale = MAX - (MAX - MIN) * ratio;
                img.style.transform = "scale(" + scale.toFixed(3) + ")";
            }
        }

        document.addEventListener("mousemove", function (ev) {
            lastEvent = ev;
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(function () {
                    if (lastEvent) {
                        apply(lastEvent);
                    }
                });
            }
        }, { passive: true });

        document.addEventListener("mouseleave", function () {
            for (var i = 0; i < images.length; i++) {
                images[i].style.transform = "";
            }
        });

        /* 触屏设备：按下时轻微反馈 */
        if ("ontouchstart" in window) {
            for (var i = 0; i < images.length; i++) {
                (function (img) {
                    img.addEventListener("touchstart", function () {
                        img.classList.add("dock-pressed");
                    }, { passive: true });
                    img.addEventListener("touchend", function () {
                        img.classList.remove("dock-pressed");
                    }, { passive: true });
                })(images[i]);
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDock);
    } else {
        initDock();
    }
})();
