/**
 * 云尚（高德）地图 - 主题管理
 * 三种模式：浅色（light）/ 深色（dark）/ 跟随系统（auto）
 * 设置保存在 localStorage，键名 yunshang_map_theme。
 */
(function (global) {
    "use strict";

    var STORAGE_KEY = "yunshang_map_theme";
    var MODES = ["light", "dark", "auto"];
    var DEFAULT_MODE = "auto";
    var mq = global.matchMedia ? global.matchMedia("(prefers-color-scheme: dark)") : null;
    var panelOpen = false;

    /* 卡片配置 theme_mode：作为本次加载的初始主题写入，之后用户仍可手动切换 */
    try {
        var forcedMode = (typeof ThemeModeParam !== "undefined" && ThemeModeParam)
            ? String(ThemeModeParam).toLowerCase() : "";
        if (MODES.indexOf(forcedMode) >= 0) {
            global.localStorage.setItem(STORAGE_KEY, forcedMode);
        }
    } catch (e) {
        /* 忽略 */
    }

    function normalize(mode) {
        mode = String(mode || "").toLowerCase();
        return MODES.indexOf(mode) >= 0 ? mode : DEFAULT_MODE;
    }

    function getMode() {
        var mode = null;
        try {
            mode = global.localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            mode = null;
        }
        return normalize(mode);
    }

    /** 宿主（Home Assistant）当前是否为深色主题 */
    function hostTheme() {
        var doc = null;
        try {
            doc = (global.parent && global.parent !== global) ? global.parent.document : null;
        } catch (e) {
            doc = null;
        }
        if (!doc || !doc.documentElement) {
            return null;
        }

        /* 1) Home Assistant 的 hass.themes.darkMode 最可靠 */
        try {
            var ha = doc.querySelector("home-assistant");
            if (ha && ha.hass && ha.hass.themes &&
                typeof ha.hass.themes.darkMode === "boolean") {
                return ha.hass.themes.darkMode ? "dark" : "light";
            }
        } catch (e) {
            /* 忽略 */
        }

        /* 2) <meta name="color-scheme"> */
        try {
            var meta = doc.querySelector('meta[name="color-scheme"]');
            if (meta) {
                var content = String(meta.getAttribute("content") || "").toLowerCase();
                var hasDark = content.indexOf("dark") >= 0;
                var hasLight = content.indexOf("light") >= 0;
                if (hasDark && !hasLight) {
                    return "dark";
                }
                if (hasLight && !hasDark) {
                    return "light";
                }
            }
        } catch (e) {
            /* 忽略 */
        }

        /* 3) html 上的 dark / light 类名 */
        try {
            var cls = doc.documentElement.classList;
            if (cls && cls.contains("dark")) {
                return "dark";
            }
            if (cls && cls.contains("light")) {
                return "light";
            }
        } catch (e) {
            /* 忽略 */
        }

        /* 4) 按宿主页面背景亮度判断 */
        try {
            var bg = global.getComputedStyle(doc.documentElement).backgroundColor;
            var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bg);
            if (m) {
                var luminance = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
                return luminance < 0.5 ? "dark" : "light";
            }
        } catch (e) {
            /* 忽略 */
        }
        return null;
    }

    /** 把模式解析为实际生效的浅色/深色 */
    function resolve(mode) {
        mode = normalize(mode || getMode());
        if (mode === "light" || mode === "dark") {
            return mode;
        }
        var host = hostTheme();
        if (host) {
            return host;
        }
        return mq && mq.matches ? "dark" : "light";
    }

    function modeLabel(mode) {
        mode = normalize(mode);
        if (mode === "dark") {
            return t ? t("themeDark") : "深色";
        }
        if (mode === "light") {
            return t ? t("themeLight") : "浅色";
        }
        return t ? t("themeAuto") : "跟随系统";
    }

    var lastResolved = null;

    function updateUi() {
        var mode = getMode();
        var resolved = resolve(mode);
        lastResolved = resolved;

        var root = document.documentElement;
        root.setAttribute("data-theme", resolved);
        root.setAttribute("data-theme-mode", mode);

        var btn = document.getElementById("toolbar_theme");
        if (btn) {
            btn.src = "images/toolbar_theme_" + mode + ".png";
            btn.title = (t ? t("themeMode") : "主题模式") + "：" + modeLabel(mode);
            btn.setAttribute("aria-label", btn.title);
        }

        var options = document.querySelectorAll("#themePanel [data-theme-mode]");
        for (var i = 0; i < options.length; i++) {
            var optionMode = options[i].getAttribute("data-theme-mode");
            if (optionMode === mode) {
                options[i].classList.add("active");
            } else {
                options[i].classList.remove("active");
            }
        }

        var meta = document.getElementById("themeColorMeta");
        if (meta) {
            meta.setAttribute("content", resolved === "dark" ? "#0f1115" : "#ffffff");
        }

        if (global.jQuery) {
            global.jQuery(document).trigger("themechange", [resolved, mode]);
            /* 下一帧再触发一次，确保地图初始化/状态更新后也能正确应用深色底图 */
            global.requestAnimationFrame(function () {
                global.jQuery(document).trigger("themechange", [resolved, mode]);
            });
        }
        return resolved;
    }

    function setMode(mode) {
        mode = normalize(mode);
        try {
            global.localStorage.setItem(STORAGE_KEY, mode);
        } catch (e) {
            /* 忽略隐私模式下的写入失败 */
        }
        var resolved = updateUi();
        showToast((t ? t("themeChanged", { mode: modeLabel(mode) }) : "主题：" + modeLabel(mode)));
        return resolved;
    }

    function cycle() {
        var mode = getMode();
        var next = mode === "light" ? "dark" : (mode === "dark" ? "auto" : "light");
        setMode(next);
        return next;
    }

    /* —— 轻提示 —— */
    var toastTimer = null;
    function showToast(text) {
        var toast = document.getElementById("ysToast");
        if (!toast) {
            return;
        }
        toast.textContent = text;
        toast.classList.add("show");
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(function () {
            toast.classList.remove("show");
        }, 1800);
    }

    /* —— 主题选择面板 —— */
    function themePanel() {
        return document.getElementById("themePanel");
    }

    function closePanel() {
        var panel = themePanel();
        if (panel) {
            panel.classList.remove("open");
        }
        panelOpen = false;
    }

    function openPanel() {
        var panel = themePanel();
        if (panel) {
            panel.classList.add("open");
        }
        panelOpen = true;
    }

    function togglePanel() {
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function bind() {
        var optionList = document.querySelectorAll("#themePanel [data-theme-mode]");
        for (var oi = 0; oi < optionList.length; oi++) {
            (function (option) {
                option.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    setMode(option.getAttribute("data-theme-mode"));
                    closePanel();
                });
            })(optionList[oi]);
        }

        var btn = document.getElementById("toolbar_theme");
        if (btn) {
            btn.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                togglePanel();
            });
        }

        var panel = themePanel();
        if (panel) {
            panel.addEventListener("click", function (event) {
                event.stopPropagation();
                var target = event.target;
                while (target && target !== panel && !target.getAttribute("data-theme-mode")) {
                    target = target.parentNode;
                }
                if (target && target !== panel) {
                    setMode(target.getAttribute("data-theme-mode"));
                    closePanel();
                }
            });
        }

        document.addEventListener("click", function () {
            if (panelOpen) {
                closePanel();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && panelOpen) {
                closePanel();
            }
        });

        if (mq) {
            var onSystemChange = function () {
                if (getMode() === "auto") {
                    updateUi();
                }
            };
            if (mq.addEventListener) {
                mq.addEventListener("change", onSystemChange);
            } else if (mq.addListener) {
                mq.addListener(onSystemChange);
            }
        }

        updateUi();

        /* 自动模式：前几秒快速重试，解决内嵌卡片 iframe 早于宿主主题就绪的问题 */
        var fastAttempts = 0;
        var fastTimer = global.setInterval(function () {
            if (getMode() !== "auto") {
                global.clearInterval(fastTimer);
                return;
            }
            var quickResolved = resolve("auto");
            if (quickResolved !== lastResolved) {
                updateUi();
            }
            fastAttempts++;
            if (fastAttempts >= 10) {
                global.clearInterval(fastTimer);
            }
        }, 400);

        /* 自动模式：定时检查宿主主题是否变化 */
        global.setInterval(function () {
            if (getMode() !== "auto") {
                return;
            }
            var resolved = resolve("auto");
            if (resolved !== lastResolved) {
                updateUi();
            }
        }, 4000);
    }

    if (document.readyState === "loading") {
        /* 尽早设置属性，避免首屏闪白/闪黑 */
        try {
            document.documentElement.setAttribute("data-theme", resolve());
            document.documentElement.setAttribute("data-theme-mode", getMode());
        } catch (e) {
            /* 忽略 */
        }
        document.addEventListener("DOMContentLoaded", bind);
    } else {
        bind();
    }

    global.YunshangTheme = {
        Modes: MODES.slice(),
        getMode: getMode,
        setMode: setMode,
        resolve: resolve,
        apply: updateUi,
        cycle: cycle,
        togglePanel: togglePanel,
        closePanel: closePanel,
        showToast: showToast,
        label: modeLabel
    };
})(window);
