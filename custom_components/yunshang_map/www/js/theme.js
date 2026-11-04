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
        try {
            var doc = global.parent && global.parent !== global ? global.parent.document : null;
            if (doc && doc.documentElement) {
                var cls = doc.documentElement.classList;
                if (cls && cls.contains("dark")) {
                    return "dark";
                }
                if (cls && cls.contains("light")) {
                    return "light";
                }
            }
        } catch (e) {
            /* 跨域或尚未就绪时忽略 */
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

    function updateUi() {
        var mode = getMode();
        var resolved = resolve(mode);

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
