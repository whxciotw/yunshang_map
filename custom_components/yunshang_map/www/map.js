/**
 * 定制地图 - Lovelace 卡片 + 可视化编辑器
 *
 * 卡片配置：
 *   type: custom:yunshang-map
 *   entities: [device_tracker.xxx, device_tracker.yyy]   # 可多选
 *   entity_id: device_tracker.xxx                        # 兼容单实体写法
 *   zoom: 16                                             # 可选，默认 15
 */
customElements.whenDefined('ha-panel-lovelace').then(() => {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const html = LitElement.prototype.html;
  const css = LitElement.prototype.css;

  const CARD_VERSION = "1.2.0";

  /* ============================================================
   * 可视化编辑器
   * ============================================================ */
  class YunshangMapEditor extends LitElement {
    static properties = {
      hass: {},
      _config: {},
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
          name: "zoom",
          selector: { number: { min: 3, max: 18, mode: "box", step: 1 } },
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
      return {
        entities: entities,
        zoom: config.zoom === undefined ? 15 : config.zoom,
      };
    }

    _computeLabel(schema) {
      if (schema.name === "entities") {
        return "设备实体（可多选）";
      }
      if (schema.name === "zoom") {
        return "地图缩放级别（3-18）";
      }
      return schema.name;
    }

    _computeHelper(schema) {
      if (schema.name === "entities") {
        return "选择要在地图上显示的 device_tracker 实体，支持多选。";
      }
      if (schema.name === "zoom") {
        return "数值越大越放大，默认 15。";
      }
      return "";
    }

    _valueChanged(event) {
      const value = event.detail.value || {};
      const config = Object.assign({}, this._config);
      config.type = config.type || "custom:yunshang-map";
      if (Array.isArray(value.entities)) {
        config.entities = value.entities;
      }
      if (value.zoom === undefined || value.zoom === "" || value.zoom === null) {
        delete config.zoom;
      } else {
        config.zoom = Number(value.zoom);
      }
      /* 保持兼容：使用 entities 时移除旧的单实体写法 */
      if (config.entities && config.entities.length > 0) {
        delete config.entity_id;
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
            提示：卡片通过内嵌页面显示高德地图；如需给设备显示用户头像，可在 HA 的
            customize.yaml 中为该 device_tracker 配置 entity_picture。
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
      hass: {},
      stateObj: {},
      config: {},
    };

    static styles = css`
      iframe {
        border: none;
        width: 100%;
        display: block;
        border-radius: 8px;
      }
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        font-size: 14px;
        color: var(--secondary-text-color);
      }
    `;

    constructor() {
      super();
      this.hasstoken = sessionStorage["YUNSHANG_MAP_HASSTOKEN"];
    }

    /* —— 卡片元信息 —— */

    static getStubConfig(hass, entities, entitiesFallback) {
      const pick = (list) =>
        (list || []).find((id) => typeof id === "string" && id.startsWith("device_tracker."));
      let entity =
        pick(entities) ||
        pick(entitiesFallback) ||
        (hass && Object.keys(hass.states).find((id) => id.startsWith("device_tracker.")));
      return {
        entities: entity ? [entity] : [],
        zoom: 16,
      };
    }

    static getConfigElement() {
      return document.createElement("yunshang-map-editor");
    }

    setConfig(config) {
      const hasEntities =
        (Array.isArray(config.entities) && config.entities.length > 0) ||
        !!config.entity_id;
      if (!hasEntities) {
        throw new Error("请至少选择要显示的设备实体（device_tracker）");
      }
      this.config = config;
    }

    getCardSize() {
      const height = (this.offsetWidth || 300) / (16 / 9);
      return Math.ceil(height / 50) || 4;
    }

    /* —— 实体列表 —— */

    _entityIds() {
      const config = this.config || {};
      if (this.stateObj && this.stateObj.entity_id) {
        return [this.stateObj.entity_id];
      }
      if (Array.isArray(config.entities) && config.entities.length > 0) {
        return config.entities
          .map((entity) => (typeof entity === "string" ? entity : entity && entity.entity))
          .filter(Boolean);
      }
      if (config.entity_id) {
        return [config.entity_id];
      }
      return [];
    }

    render() {
      const entityIds = this._entityIds();
      if (this.hasstoken) {
        const version = CARD_VERSION;
        let zoom = 15;
        let height = this.offsetWidth == 0 ? this.parentElement.offsetWidth : this.offsetWidth;

        if (this.stateObj) {
          height = 300;
        } else if (this.config && this.config.zoom !== undefined) {
          zoom = this.config.zoom;
        }

        return html`
          <iframe
            style="height: ${height}px;"
            src="/yunshang_map_www/card.html?hasstoken=${this.hasstoken}&v=${version}&idlist=${encodeURIComponent(entityIds.join(","))}&zoom=${zoom}"
          ></iframe>
          ${this.stateObj
            ? html`<ha-attributes .hass=${this.hass} .stateObj=${this.stateObj}></ha-attributes>`
            : ""}
        `;
      }

      if (!this.loading) {
        this.loading = true;
        this.hass
          .callWS({ type: "yunshang_map", data: { type: "gaodekey" } })
          .then(({ hasstoken }) => {
            sessionStorage["YUNSHANG_MAP_HASSTOKEN"] = hasstoken;
            this.hasstoken = hasstoken;
          })
          .catch(() => {
            this.loading = false;
          });
      }
      return html`<div class="loading">定制地图卡片加载中…</div>`;
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
    description: "定制地图卡片：在地图卡片中显示设备位置（支持多设备与可视化编辑）",
  });
});
