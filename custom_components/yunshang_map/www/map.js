/**
 * 定制地图 - Lovelace 卡片 + 可视化编辑器
 *
 * 卡片配置（参考 Home Assistant 官方地图卡片的选项）：
 *   type: custom:yunshang-map
 *   entities: [device_tracker.xxx, device_tracker.yyy]
 *   geo_location_sources: [gdacs, usgs_earthquakes_feed]   # 或 all
 *   hours_to_show: 24                                       # 0 表示不显示历史轨迹
 *   default_zoom: 14
 *   map_type: amap          # amap / amap-satellite / amap-traffic / baidu / baidu-satellite / baidu-traffic / osm
 *   theme_mode: auto        # auto / light / dark
 *   aspect_ratio: 16:9       # 可选，控制卡片高度（留空则自适应布局）
 */
customElements.whenDefined('ha-panel-lovelace').then(() => {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const html = LitElement.prototype.html;
  const css = LitElement.prototype.css;

  const CARD_VERSION = "1.5.0";

  const MAP_TYPES = [
    { value: "amap", label: "高德地图" },
    { value: "amap-satellite", label: "高德卫星" },
    { value: "amap-traffic", label: "高德路况" },
    { value: "baidu", label: "百度地图" },
    { value: "baidu-satellite", label: "百度卫星" },
    { value: "baidu-traffic", label: "百度路况" },
    { value: "osm", label: "OSM 地图" },
  ];

  const TOKEN_STORAGE = "YUNSHANG_MAP_TOKENS";

  function parseAspectRatio(value) {
    if (!value || typeof value !== "string") {
      return null;
    }
    const text = value.trim().toLowerCase();
    if (!text) {
      return null;
    }
    const parts = text.replace(":", "x").split("x");
    const w = parseFloat(parts[0]);
    const h = parts.length > 1 ? parseFloat(parts[1]) : 1;
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    return w + " / " + h;
  }

  /* ============================================================
   * 可视化编辑器
   * ============================================================ */
  class YunshangMapEditor extends LitElement {
    static properties = {
      hass: { attribute: false },
      _config: { state: true },
    };

    constructor() {
      super();
      this._config = {};
    }

    static styles = css`
      :host {
        display: block;
      }
      .editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 4px 0;
      }
      .hint {
        font-size: 12px;
        color: var(--secondary-text-color);
        line-height: 1.6;
        padding: 0 4px;
      }
    `;

    setConfig(config) {
      this._config = config || {};
    }

    get _schema() {
      return [
        {
          name: "entities",
          required: true,
          selector: { entity: { domain: ["device_tracker"], multiple: true } },
        },
        {
          name: "geo_location_sources",
          selector: { text: {} },
        },
        {
          name: "hours_to_show",
          selector: { number: { min: 0, max: 168, mode: "box", step: 1 } },
        },
        {
          name: "default_zoom",
          selector: { number: { min: 3, max: 18, mode: "box", step: 1 } },
        },
        {
          name: "map_type",
          selector: { select: { options: MAP_TYPES, mode: "dropdown" } },
        },
        {
          name: "theme_mode",
          selector: {
            select: {
              options: [
                { value: "auto", label: "跟随系统 / HA 主题" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
              ],
              mode: "dropdown",
            },
          },
        },
        {
          name: "aspect_ratio",
          selector: { text: {} },
        },
      ];
    }

    get _data() {
      const config = this._config || {};
      let entities = [];
      if (Array.isArray(config.entities)) {
        entities = config.entities;
      } else if (config.entity_id) {
        entities = [config.entity_id];
      }
      let sources = config.geo_location_sources || [];
      if (typeof sources === "string") {
        sources = sources.split(",");
      }
      sources = sources.map((s) => String(s).trim()).filter(Boolean);
      return {
        entities: entities,
        geo_location_sources: sources.join(", "),
        hours_to_show: config.hours_to_show === undefined ? 24 : config.hours_to_show,
        default_zoom:
          config.default_zoom === undefined
            ? config.zoom === undefined
              ? 14
              : config.zoom
            : config.default_zoom,
        map_type: config.map_type || "amap",
        theme_mode: config.theme_mode || "auto",
        aspect_ratio: config.aspect_ratio || "",
      };
    }

    _computeLabel(schema) {
      const labels = {
        entities: "设备实体（可多选）",
        geo_location_sources: "地理位置来源（geo_location）",
        hours_to_show: "显示过去几小时的历史轨迹",
        default_zoom: "默认缩放级别（3-18）",
        map_type: "地图底图",
        theme_mode: "主题模式",
        aspect_ratio: "卡片宽高比（例如 16:9，留空自适应）",
      };
      return labels[schema.name] || schema.name;
    }

    _computeHelper(schema) {
      const helpers = {
        entities: "选择要显示的 device_tracker 实体，支持多选。",
        geo_location_sources:
          "可选。填写 geo_location 实体的来源（source）名称，多个用英文逗号分隔；填 all 表示全部。",
        hours_to_show: "0 表示不显示历史轨迹；默认 24 小时。",
        default_zoom: "地图打开时的缩放级别，默认 14。",
        map_type: "支持高德、百度、OSM 等多种底图。",
        theme_mode: "深色模式会自动应用到地图瓦片与面板。",
        aspect_ratio: "在非分区（masonry）布局中控制卡片高度，例如 16:9、1:1、4:3。",
      };
      return helpers[schema.name] || "";
    }

    _valueChanged(event) {
      const value = event.detail.value || {};
      const config = Object.assign({}, this._config);
      config.type = config.type || "custom:yunshang-map";

      if (Array.isArray(value.entities)) {
        config.entities = value.entities;
        delete config.entity_id;
      }
      if (typeof value.geo_location_sources === "string") {
        const sources = value.geo_location_sources
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (sources.length) {
          config.geo_location_sources = sources;
        } else {
          delete config.geo_location_sources;
        }
      }
      ["hours_to_show", "default_zoom"].forEach((key) => {
        const raw = value[key];
        if (raw === undefined || raw === "" || raw === null) {
          if (key === "default_zoom" && config.zoom !== undefined) {
            config.default_zoom = config.zoom;
            delete config.zoom;
          } else {
            delete config[key];
          }
        } else {
          config[key] = Number(raw);
        }
      });
      if (value.map_type) {
        config.map_type = value.map_type;
      }
      if (value.theme_mode) {
        config.theme_mode = value.theme_mode;
      }
      if (typeof value.aspect_ratio === "string" && value.aspect_ratio.trim()) {
        config.aspect_ratio = value.aspect_ratio.trim();
      } else {
        delete config.aspect_ratio;
      }

      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config },
          bubbles: true,
          composed: true,
        })
      );
    }

    render() {
      return html`
        <div class="editor">
          <ha-form
            .hass=${this.hass}
            .data=${this._data}
            .schema=${this._schema}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>
          <div class="hint">
            提示：卡片通过内嵌页面显示地图，并支持设备列表、轨迹回放、回家路线、多设备历史轨迹与
            8 种底图。设备头像可在 HA 的 customize.yaml 中通过 entity_picture 配置。
          </div>
        </div>
      `;
    }
  }

  if (!customElements.get("yunshang-map-editor")) {
    customElements.define("yunshang-map-editor", YunshangMapEditor);
  }

  /* ============================================================
   * 地图卡片
   * ============================================================ */
  class YunshangMapCard extends LitElement {
    static properties = {
      hass: { attribute: false },
      stateObj: { attribute: false },
      config: { attribute: false },
      _tokens: { state: true },
    };

    static styles = css`
      :host {
        display: block;
        height: 100%;
        min-height: 200px;
      }
      .root {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 200px;
        overflow: hidden;
        border-radius: 10px;
        background: var(--card-background-color, #fff);
        aspect-ratio: 16 / 9;
      }
      iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
      .loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: var(--secondary-text-color);
      }
    `;

    constructor() {
      super();
      this._tokens = this._readTokens();
    }

    _readTokens() {
      try {
        const raw = sessionStorage.getItem(TOKEN_STORAGE);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (e) {
        /* 忽略 */
      }
      return null;
    }

    static getStubConfig(hass, entities, entitiesFallback) {
      const pick = (list) =>
        (list || []).find((id) => typeof id === "string" && id.startsWith("device_tracker."));
      const entity =
        pick(entities) ||
        pick(entitiesFallback) ||
        (hass && Object.keys(hass.states).find((id) => id.startsWith("device_tracker.")));
      return {
        entities: entity ? [entity] : [],
        hours_to_show: 24,
        default_zoom: 14,
        map_type: "amap",
        theme_mode: "auto",
      };
    }

    static getConfigElement() {
      return document.createElement("yunshang-map-editor");
    }

    setConfig(config) {
      const hasEntities =
        (Array.isArray(config.entities) && config.entities.length > 0) || !!config.entity_id;
      if (!hasEntities) {
        throw new Error("请至少选择要显示的设备实体（device_tracker）");
      }
      this.config = config;
    }

    getCardSize() {
      const ratio = parseAspectRatio(this.config && this.config.aspect_ratio);
      if (ratio) {
        const parts = ratio.split("/").map((p) => parseFloat(p));
        return Math.max(2, Math.ceil(((parts[1] / parts[0]) * 100) / 50));
      }
      return 7;
    }

    _ensureTokens() {
      if (this._tokens && this._tokens.hasstoken) {
        return;
      }
      if (this._loadingTokens) {
        return;
      }
      this._loadingTokens = true;
      this.hass
        .callWS({ type: "yunshang_map", data: { type: "gaodekey" } })
        .then((result) => {
          this._tokens = {
            hasstoken: result.hasstoken || "",
            gaodekey: result.gaodekey || "",
            jscode: result.jscode || "",
          };
          try {
            sessionStorage.setItem(TOKEN_STORAGE, JSON.stringify(this._tokens));
          } catch (e) {
            /* 忽略 */
          }
        })
        .catch(() => {
          this._tokens = null;
        })
        .finally(() => {
          this._loadingTokens = false;
        });
    }

    _entityIds() {
      const config = this.config || {};
      let entities = [];
      if (this.stateObj && this.stateObj.entity_id) {
        entities = [this.stateObj.entity_id];
      } else if (Array.isArray(config.entities) && config.entities.length > 0) {
        entities = config.entities.map((e) => (typeof e === "string" ? e : e && e.entity));
      } else if (config.entity_id) {
        entities = [config.entity_id];
      }
      entities = entities.filter(Boolean);

      /* geo_location_sources：把匹配来源的 geo_location 实体也加入 */
      const sourcesRaw = config.geo_location_sources;
      let sources = [];
      if (Array.isArray(sourcesRaw)) {
        sources = sourcesRaw.map((s) => String(s));
      } else if (typeof sourcesRaw === "string" && sourcesRaw.trim()) {
        sources = sourcesRaw.split(",").map((s) => s.trim());
      }
      if (sources.length && this.hass && this.hass.states) {
        const all = sources.indexOf("all") >= 0;
        Object.values(this.hass.states).forEach((stateObj) => {
          if (!stateObj.entity_id.startsWith("geo_location.")) {
            return;
          }
          const source = stateObj.attributes && stateObj.attributes.source;
          if (all || sources.indexOf(source) >= 0) {
            if (entities.indexOf(stateObj.entity_id) === -1) {
              entities.push(stateObj.entity_id);
            }
          }
        });
      }
      return entities;
    }

    _iframeSrc(entityIds) {
      const config = this.config || {};
      const tokens = this._tokens || {};
      const zoom = config.default_zoom !== undefined ? config.default_zoom : config.zoom;
      const params = new URLSearchParams();
      params.set("hasstoken", tokens.hasstoken || "");
      params.set("gaodekey", tokens.gaodekey || "");
      params.set("jscode", tokens.jscode || "");
      params.set("v", CARD_VERSION);
      params.set("embed", "1");
      params.set("idlist", entityIds.join(","));
      params.set("zoom", String(zoom !== undefined ? zoom : 14));
      params.set("hours", String(config.hours_to_show !== undefined ? config.hours_to_show : 24));
      params.set("maptype", config.map_type || "amap");
      params.set("thememode", config.theme_mode || "auto");
      return "/yunshang_map_www/index.html?" + params.toString();
    }

    render() {
      if (!this._tokens || !this._tokens.hasstoken) {
        this._ensureTokens();
        return html`<div class="root"><div class="loading">定制地图卡片加载中…</div></div>`;
      }
      const entityIds = this._entityIds();
      const ratio = parseAspectRatio(this.config && this.config.aspect_ratio);
      const rootStyle = ratio ? `height:auto;aspect-ratio:${ratio};` : "";
      return html`
        <div class="root" style=${rootStyle}>
          <iframe
            title="定制地图"
            src=${this._iframeSrc(entityIds)}
            loading="lazy"
            allow="fullscreen"
          ></iframe>
        </div>
      `;
    }
  }

  if (!customElements.get("yunshang-map")) {
    customElements.define("yunshang-map", YunshangMapCard);
  }

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "yunshang-map",
    name: "定制地图",
    preview: true,
    description: "定制地图卡片：高德/百度/OSM 底图、设备列表、轨迹回放与多设备历史轨迹",
  });
});
