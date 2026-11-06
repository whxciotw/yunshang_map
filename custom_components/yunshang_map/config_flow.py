"""定制地图 - 配置流程。"""
import logging
from collections import OrderedDict

import voluptuous as vol
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)
from homeassistant import config_entries
from homeassistant.core import callback

from .manifest import manifest

DOMAIN = manifest.domain
VERSION = manifest.version

_LOGGER = logging.getLogger(__name__)


@config_entries.HANDLERS.register(DOMAIN)
class FlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """定制地图 配置流程。"""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """获取选项流程。"""
        return OptionsFlow()

    def __init__(self):
        """初始化。"""
        self._errors = {}

    async def async_step_user(self, user_input={}):
        self._errors = {}
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            _LOGGER.debug(user_input)
            return self.async_create_entry(title="定制地图", data=user_input)

        return await self._show_config_form(user_input)

    async def _show_config_form(self, user_input):
        data_schema = OrderedDict()
        data_schema[vol.Optional("gaodekey", default="")] = str
        data_schema[vol.Optional("jscode", default="")] = str
        data_schema[vol.Optional("longtoken", default="")] = str

        return self.async_show_form(
            step_id="user", data_schema=vol.Schema(data_schema), errors=self._errors
        )


MAP_TYPE_OPTIONS = [
    {"value": "amap", "label": "高德地图"},
    {"value": "amap-satellite", "label": "高德卫星"},
    {"value": "baidu", "label": "百度地图"},
    {"value": "baidu-satellite", "label": "百度卫星"},
    {"value": "osm", "label": "OSM 地图"},
]
ALL_MAP_TYPES = [item["value"] for item in MAP_TYPE_OPTIONS]


class OptionsFlow(config_entries.OptionsFlow):
    """定制地图 选项流程。"""

    async def async_step_init(self, user_input=None):
        """管理选项。"""
        return await self.async_step_user()

    async def async_step_user(self, user_input=None):
        """处理用户输入。"""
        entry = self.config_entry
        config = dict(entry.data)
        if user_input is not None:
            if user_input["longtoken"] == "null":
                user_input["longtoken"] = ""
            config.update(user_input)
            self.hass.config_entries.async_update_entry(entry, data=config)
            _LOGGER.debug(user_input)
            await self.hass.config_entries.async_reload(entry.entry_id)
            return self.async_create_entry(title="", data=user_input)

        device_states = self.hass.states.async_all(["device_tracker"])
        device_entities = []
        for state in device_states:
            if state.attributes.get("latitude") and state.attributes.get("longitude"):
                friendly_name = state.attributes.get("friendly_name") or state.entity_id
                device_entities.append(
                    {
                        "value": state.entity_id,
                        "label": f"{friendly_name}（{state.entity_id}）",
                    }
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional("gaodekey", default=config.get("gaodekey", "")): cv.string,
                    vol.Optional("jscode", default=config.get("jscode")): cv.string,
                    vol.Optional("longtoken", default=config.get("longtoken")): cv.string,
                    vol.Optional(
                        "trackerids",
                        default=entry.options.get("trackerids", []),
                    ): SelectSelector(
                        SelectSelectorConfig(
                            options=device_entities,
                            multiple=True,
                            mode=SelectSelectorMode.DROPDOWN,
                            translation_key="trackerids",
                        )
                    ),
                    vol.Optional(
                        "maptypes",
                        default=entry.options.get("maptypes", ALL_MAP_TYPES),
                    ): SelectSelector(
                        SelectSelectorConfig(
                            options=MAP_TYPE_OPTIONS,
                            multiple=True,
                            mode=SelectSelectorMode.DROPDOWN,
                        )
                    ),
                }
            ),
        )
