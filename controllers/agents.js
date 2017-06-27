const Twilio 	= require('twilio')

const AccessToken 	= Twilio.jwt.AccessToken
const VideoGrant 		= Twilio.jwt.AccessToken.VideoGrant
const ChatGrant 		= Twilio.jwt.AccessToken.IpMessagingGrant

const client = new Twilio(
	process.env.TWILIO_ACCOUNT_SID,
	process.env.TWILIO_AUTH_TOKEN)

const taskrouterHelper = require('./helpers/taskrouter-helper.js')

module.exports.login = function (req, res) {
	const friendlyName = req.body.worker.friendlyName

	const filter = { friendlyName: friendlyName }

	client.taskrouter.v1.workspaces(process.env.TWILIO_WORKSPACE_SID).workers.list(filter)
		.then(workers => {

			for (let i = 0; i < workers.length; i++) {
				let worker = workers[i]

				if (worker.friendlyName === friendlyName) {
					const tokens = createWorkerTokens(req.configuration, worker, req.body.endpoint)

					req.session.tokens = tokens
					req.session.worker = {
						sid: worker.sid,
						friendlyName: worker.friendlyName,
						attributes: worker.attributes
					}

					res.status(200).end()
					return
				}

			}

			res.status(404).end()

		}).catch(error => {
			res.status(500).send(res.convertErrorToJSON(error))
		})
}

var createWorkerTokens = function (configuration, worker, endpoint) {
	/* all token we generate are valid for 1 hour */
	const lifetime = 3600

	/* create a token for Twilio TaskRouter */
	const workerCapability = taskrouterHelper.createWorkerCapabilityToken(worker.sid)

	/* create a token for Twilio Client */
	const ClientCapability = Twilio.jwt.ClientCapability

	const phoneCapability = new ClientCapability({
		accountSid: process.env.TWILIO_ACCOUNT_SID,
		authToken: process.env.TWILIO_AUTH_TOKEN,
		ttl: lifetime,
	})

	const clientName = worker.friendlyName.toLowerCase()

	phoneCapability.addScope(new ClientCapability.IncomingClientScope(clientName))
	phoneCapability.addScope(new ClientCapability.OutgoingClientScope({
		applicationSid: configuration.twilio.applicationSid,
		clientName: worker.friendlyName.toLowerCase()
	}))

	const accessToken = new AccessToken(
		process.env.TWILIO_ACCOUNT_SID,
		process.env.TWILIO_API_KEY_SID,
		process.env.TWILIO_API_KEY_SECRET,
		{ ttl: lifetime })

	accessToken.identity = worker.friendlyName

	/* grant the access token Twilio Programmable Chat capabilities */
	const chatGrant = new ChatGrant({
		serviceSid: process.env.TWILIO_CHAT_SERVICE_SID,
		endpointId: endpoint
	})

	accessToken.addGrant(chatGrant)

	/* grant the access token Twilio Video capabilities */
	const videoGrant = new VideoGrant()

	accessToken.addGrant(videoGrant)

	return {
		worker: workerCapability.toJwt(),
		phone: phoneCapability.toJwt(),
		chatAndVideo: accessToken.toJwt()
	}

}

module.exports.logout = function (req, res) {

	req.session.destroy(function (error) {
		if (error) {
			res.status(500).send(res.convertErrorToJSON(error))
		} else {
			res.status(200).end()
		}
	})

}

module.exports.getSession = function (req, res) {
	if (!req.session.worker) {
		res.status(403).end()
	} else {

		res.status(200).json({
			tokens: req.session.tokens,
			worker: req.session.worker,
			configuration: {
				twilio: req.configuration.twilio
			}
		})

	}
}

module.exports.call = function (req, res) {
	const twiml = new Twilio.twiml.VoiceResponse()

	const dial = twiml.dial({ callerId: req.configuration.twilio.callerId })
	dial.number(req.query.phone)

	res.send(twiml.toString())
}
