"""定制地图 - 在 Home Assistant 中显示高德地图与设备追踪。

本项目基于 dscao/gaode_maps（墨澜地图）改造而来。
"""
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant.components import websocket_api, frontend
from homeassistant.components.http import StaticPathConfig

import logging
from urllib.parse import quote

from .manifest import manifest

DOMAIN = manifest.domain
VERSION = manifest.version
PANEL_TITLE = "定制地图"
PANEL_URL_PATH = DOMAIN
WWW_URL_PATH = "/" + DOMAIN + "_www"

CONFIG_SCHEMA = cv.deprecated(DOMAIN)

_LOGGER = logging.getLogger(__name__)

SCHEMA_WEBSOCKET = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
    {
        "type": DOMAIN,
        vol.Optional("data"): dict,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hasstoken = entry.data.get("longtoken", "") or ""
    if hasstoken == "null":
        hasstoken = ""
    gaodekey = entry.data.get("gaodekey") or ""
    jscode = entry.data.get("jscode") or ""
    trackerids = entry.options.get("trackerids")
    if isinstance(trackerids, list):
        devicetrackeridlist = ",".join(trackerids)
    else:
        devicetrackeridlist = ""
    maptypes = entry.options.get("maptypes")
    if isinstance(maptypes, list):
        maptypelist = ",".join(maptypes)
    else:
        maptypelist = "amap,amap-satellite,baidu,baidu-satellite,osm"

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                WWW_URL_PATH,
                hass.config.path("custom_components/" + DOMAIN + "/www"),
                False,
            )
        ]
    )

    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title=PANEL_TITLE,
        sidebar_icon="mdi:map-marker-radius",
        frontend_url_path=PANEL_URL_PATH,
        config={
            "url": (
                f"{WWW_URL_PATH}/index.html"
                f"?gaodekey={quote(gaodekey, safe='')}"
                f"&jscode={quote(jscode, safe='')}"
                f"&devicetrackeridlist={quote(devicetrackeridlist, safe='')}"
                f"&maptypes={quote(maptypelist, safe='')}"
                f"&v={VERSION}"
            )
        },
        require_admin=False,
    )

    frontend.add_extra_js_url(hass, f"{WWW_URL_PATH}/map.js?v={VERSION}")

    def receive_data(hass, connection, msg):
        """返回面板/卡片所需的前端配置。

        长期访问令牌只返回给管理员：内嵌在 HA 中的面板/卡片会复用父页面
        会话，不需要长期令牌；非管理员拿到令牌等同于拿到管理员的 HA API。
        """
        data = msg.get("data") or {}
        msg_type = data.get("type", "")
        if msg_type == "gaodekey":
            is_admin = bool(connection.user and connection.user.is_admin)
            connection.send_message(
                websocket_api.result_message(
                    msg["id"],
                    {
                        "hasstoken": hasstoken if is_admin else "",
                        "gaodekey": gaodekey,
                        "jscode": jscode,
                        "maptypes": maptypelist,
                    },
                )
            )

    websocket_api.async_register_command(
        hass,
        DOMAIN,
        receive_data,
        SCHEMA_WEBSOCKET,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return True
