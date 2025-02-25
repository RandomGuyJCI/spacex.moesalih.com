const functions = require('firebase-functions');

const axios = require('axios');
const { getEpochTimestamp, getSatelliteInfo } = require('tle.js');



module.exports = {}

module.exports.starlinkApi = functions.https.onRequest(async (request, response) => {
	// module.exports.test = functions.https.onCall(async (data, context) => {

	try {

		let data = await getStarlinkData()

		response.header('Access-Control-Allow-Origin', '*')
		response.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
		response.set('Cache-Control', 'public, max-age=1800')
		response.json(data)

	} catch(e) {
		console.error(e)
		response.json({ error: e })
	}
})


let array_chunks = (array, chunk_size) => Array(Math.ceil(array.length / chunk_size)).fill(0).map((_, index) => index * chunk_size).map(begin => array.slice(begin, begin + chunk_size));

let getStarlinkData = async () => {
	let loginReposnse = await axios.post('https://www.space-track.org/ajaxauth/login', {
		identity: functions.config().spacetrack.email,
		password: functions.config().spacetrack.password
	})
	let cookie = loginReposnse.headers['set-cookie'][0]

	let satelliteIds = require('fs').readFileSync('starlink-satellites.txt', 'utf8')
	satelliteIds = satelliteIds.split('\n').map(l => l.trim()).filter(l => !!l)

	let satelliteIdsChunks = array_chunks(satelliteIds, 500)
	console.log(satelliteIdsChunks.length);

	let promises = satelliteIdsChunks.map(satelliteIds => {
		let satelliteIdsText = satelliteIds.join(',')
		console.log(satelliteIdsText);

		return axios.get('https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/'+satelliteIdsText+'/orderby/TLE_LINE1 ASC/format/3le', {
			headers: { 'Cookie': cookie }
		}).then(dataResponse => {
			console.log('response');
			let data = parseTLE(dataResponse.data)
			return data
		})
	})

	return Promise.all(promises).then(data => {
		let finalData = []
		for (const d of data) {
			finalData = finalData.concat(d)
		}
		return new Promise((resolve, reject) => resolve(finalData))
	})
}


let parseTLE = (tle) => {
	let lines = tle.split('\n').map(l => l.trim())
	// console.log(lines)

	let satellites = []
	let currentSatellite

	for (var line of lines) {
		// console.log(line)
		let components = line.split(' ').filter(c => !!c)
		// console.log(components)

		switch (components[0]) {

			case '0': // satellite name
			currentSatellite = { name: components[1] }
			break

			case '1': // info
			currentSatellite.tle1 = line
			currentSatellite.designator = components[2]
			currentSatellite.launch = 'Starlink-'+designatorToLaunchNumber(currentSatellite.designator)
			let yearText = components[3].substring(0,2)
			currentSatellite.year = parseInt(yearText) + 2000
			let dayText = components[3].substring(2)
			currentSatellite.day = parseFloat(dayText)
			break

			case '2': // data
			currentSatellite.tle2 = line
			currentSatellite.id = components[1]
			currentSatellite.inclination = parseFloat(components[2])
			currentSatellite.longitudeAscendingNode = parseFloat(components[3])
			currentSatellite.argumentOfPerigee = parseFloat(components[5])
			currentSatellite.anomaly = parseFloat(components[6])
			currentSatellite.motion = parseFloat(components[7])

			try {
				let tle = [currentSatellite.tle1,currentSatellite.tle2]
				currentSatellite.timestamp = getEpochTimestamp(tle)
				currentSatellite.info = getSatelliteInfo(tle)
			} catch (e) {
				// console.log(e);
				currentSatellite.info = {}
			}
			satellites.push(currentSatellite)
			currentSatellite = null
			break

			default:
			break
		}

	}

	return satellites
}

let designatorToLaunchNumber = (designator) => {
	let launches = ['19029', '19074', '20001', '20006', '20012', '20019', '20025', '20035', '20038', '20055', '20057', '20062', '20070', '20073', '20074', '20088']
	for (var l of launches) {
		if (designator.includes(l)) return launches.indexOf(l)
	}
	return 'X'
}
