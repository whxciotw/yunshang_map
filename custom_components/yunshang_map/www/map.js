customElements.whenDefined('ha-panel-lovelace').then(() => {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const html = LitElement.prototype.html;
  const css = LitElement.prototype.css;

  customElements.define('yunshang-map', class extends LitElement {

    static properties = {
      hass: {},
      stateObj: {},
      config: {},
      gaodekey: {}
    };

    static styles = css`iframe{border: none; width: 100%; display: block; border-radius: 8px;}`

    constructor() {
      super();
      this.hasstoken = sessionStorage['YUNSHANG_MAP_HASSTOKEN']
    }

    static getStubConfig() {
      return {
        entity_id: "device_tracker.xxx",
        zoom: 16
      }
    }

    setConfig(config) {
      if (!config.entity_id) {
        throw new Error('请先配置要显示的设备实体（entity_id）');
      }
      this.config = config;
    }

    render() {
      if (this.hasstoken) {
        const version = new Date().toLocaleDateString()
        let zoom = 15
        let entity_id = null
        let height = this.offsetWidth == 0 ? this.parentElement.offsetWidth : this.offsetWidth

        const { config, stateObj } = this
        if (stateObj) {
          entity_id = stateObj.entity_id
          height = 300
        } else {
          zoom = config.zoom
          entity_id = config.entity_id
        }

        return html`<iframe style="height: ${height}px;" 
          src="/yunshang_map_www/card.html?hasstoken=${this.hasstoken}&v=${version}&idlist=${entity_id}&zoom=${zoom}"
          ></iframe>${stateObj ? html`<ha-attributes .hass=${this.hass} .stateObj=${stateObj}></ha-attributes>` : ''}`
      } else {
        if (!this.loading) {
          this.loading = true
          this.hass.callWS({ type: 'yunshang_map', data: { type: 'gaodekey' } }).then(({ hasstoken }) => {
            sessionStorage['YUNSHANG_MAP_HASSTOKEN'] = hasstoken;
            this.hasstoken = hasstoken;
          })
        }
        return html`云尚（高德）地图卡片加载中…`
      }
    }
  })

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "yunshang-map",
    name: "云尚（高德）地图",
    preview: true,
    description: "云尚（高德）地图卡片：在地图卡片中显示设备位置"
  });

})
