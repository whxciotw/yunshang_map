HomeAssistantWebAPIUrl = "./../.."

const query = new URLSearchParams(location.search)
GaodeMapKey = query.get('gaodekey', '')
GaodeMapjscode = query.get('jscode', '')
GaodeMapserviceHost = query.get('servicehost', '')
hasstoken = query.get('hasstoken', '')
if (hasstoken == '') {
	LongTimeToken = ""
} else {
	LongTimeToken = "Bearer " + hasstoken
}
/* 面板模式：devicetrackeridlist；卡片内嵌模式：idlist */
DeviceTrackerIDList = query.get('devicetrackeridlist', '') || query.get('idlist', '')
EmbedMode = query.get('embed', '') === '1'
HoursToShow = parseInt(query.get('hours', '0'), 10) || 0
ThemeModeParam = query.get('thememode', '')
MapTypeParam = query.get('maptype', '')
