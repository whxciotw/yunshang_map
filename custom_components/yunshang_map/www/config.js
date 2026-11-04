HomeAssistantWebAPIUrl = "./../.."

const query = new URLSearchParams(location.search)
GaodeMapKey = query.get('gaodekey')
GaodeMapjscode = query.get('jscode')
GaodeMapserviceHost = query.get('servicehost', '')
hasstoken = query.get('hasstoken', '')
if (hasstoken == '') {
	LongTimeToken = ""
} else {
	LongTimeToken = "Bearer " + hasstoken
}
DeviceTrackerIDList = query.get('devicetrackeridlist', '')
