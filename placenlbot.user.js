// ==UserScript==
// @name		 PlaceNL Bot
// @namespace	https://github.com/PlaceNL/Bot
// @version	  4
// @description  De bot voor PlaceNL!
// @author	   NoahvdAa
// @match		https://www.reddit.com/r/place/*
// @match		https://new.reddit.com/r/place/*
// @icon		 https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require		 https://cdn.jsdelivr.net/npm/toastify-js
// @resource	 TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL	https://github.com/PlaceNL/Bot/raw/master/placenlbot.user.js
// @downloadURL  https://github.com/PlaceNL/Bot/raw/master/placenlbot.user.js
// @grant		GM_getResourceText
// @grant		GM_addStyle
// ==/UserScript==

// Sorry voor de rommelige code, haast en clean gaatn iet altijd samen ;)

var placeOrders = [];
var accessToken;
var currentPlaceCanvas = document.createElement('canvas');

const COLOR_MAPPINGS = {
	'#FF4500': 2,
	'#FFA800': 3,
	'#FFD635': 4,
	'#00A368': 6,
	'#7EED56': 8,
	'#2450A4': 12,
	'#3690EA': 13,
	'#51E9F4': 14,
	'#811E9F': 18,
	'#B44AC0': 19,
	'#FF99AA': 23,
	'#9C6926': 25,
	'#000000': 27,
	'#898D90': 29,
	'#D4D7D9': 30,
	'#FFFFFF': 31
};

(async function () {
    GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
    currentPlaceCanvas.width = 2000;
    currentPlaceCanvas.height = 1000;
    currentPlaceCanvas.style.display = 'none';
    currentPlaceCanvas = document.body.appendChild(currentPlaceCanvas);

	Toastify({
		text: 'Access token retrieval...',
		duration: 10000
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Access token retrieved!',
		duration: 10000
	}).showToast();

	setInterval(updateOrders, 5 * 60 * 1000); // Update orders elke vijf minuten.
	await updateOrders();
	attemptPlace();
})();

async function attemptPlace() {
	var ctx;
	try {
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('0'), currentPlaceCanvas, 0, 0);
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('1'), currentPlaceCanvas, 1000, 0);
	} catch (e) {
		console.warn('Map retrieval error: ', e);
		Toastify({
			text: 'Error retrieving map. Retry in 15 sec...',
			duration: 10000
		}).showToast();
		setTimeout(attemptPlace, 15000); // probeer opnieuw in 15sec.
		return;
	}

	for (const order of placeOrders) {
		const x = order[0];
		const y = order[1];
		const colorId = order[2];
		const rgbaAtLocation = ctx.getImageData(x, y, 1, 1).data;
		const hex = rgbToHex(rgbaAtLocation[0], rgbaAtLocation[1], rgbaAtLocation[2]);
		const currentColorId = COLOR_MAPPINGS[hex];
		// Deze pixel klopt al.
		if (currentColorId == colorId) continue;

		Toastify({
			text: `Trying to place pixels at ${x}, ${y}....`,
			duration: 10000
		}).showToast();
		await place(x, y, colorId);

		Toastify({
			text: `Waiting for cooldown...`,
			duration: 315000
		}).showToast();
		setTimeout(attemptPlace, 315000); // 5min en 15sec, just to be safe.
		return;
	}

	Toastify({
		text: 'All the pixels are already in the right place!',
		duration: 10000
	}).showToast();
	setTimeout(attemptPlace, 30000); // probeer opnieuw in 30sec.
}

function updateOrders() {
	fetch('https://raw.githubusercontent.com/alexandregv/Orders/master/orders.json').then(async (response) => {
		if (!response.ok) return console.warn('Cannot retrieve orders! (non-ok status code)');
		const data = await response.json();

		if (JSON.stringify(data) !== JSON.stringify(placeOrders)) {
			Toastify({
				text: `New orders loaded. Total number of pixels: ${data.length}.`,
				duration: 10000
			}).showToast();
		}

		placeOrders = data;
	}).catch((e) => console.warn('Cannot retrieve orders!', e));
}

function place(x, y, color) {
	return fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x % 1000,
							'y': y % 1000
						},
						'colorIndex': color,
						'canvasIndex': (x > 999 ? 1 : 0)
					}
				}
			},
			'query': 'mutation setPixel($input: ActInput!) {\n  act(input: $input) {\n	data {\n	  ... on BasicMessage {\n		id\n		data {\n		  ... on GetUserCooldownResponseMessageData {\n			nextAvailablePixelTimestamp\n			__typename\n		  }\n		  ... on SetPixelResponseMessageData {\n			timestamp\n			__typename\n		  }\n		  __typename\n		}\n		__typename\n	  }\n	  __typename\n	}\n	__typename\n  }\n}\n'
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
}

async function getAccessToken() {
	const usingOldReddit = window.location.href.includes('new.reddit.com');
	const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
	const response = await fetch(url);
	const responseText = await response.text();

	// TODO: ew
	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

async function getCurrentImageUrl(id = 0) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));
			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': id
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': 'subscription replace($input: SubscribeInput!) {\n  subscribe(input: $input) {\n	id\n	... on BasicMessage {\n	  data {\n		__typename\n		... on FullFrameMessageData {\n		  __typename\n		  name\n		  timestamp\n		}\n	  }\n	  __typename\n	}\n	__typename\n  }\n}'
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			// TODO: ew
			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name + `?noCache=${Date.now() * Math.random()}`);
		}


		ws.onerror = reject;
	});
}

function getCanvasFromUrl(url, canvas, x = 0, y = 0) {
	return new Promise((resolve, reject) => {
		let loadImage = ctx => {
			var img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				ctx.drawImage(img, x, y);
				resolve(ctx);
			};
			img.onerror = () => {
				Toastify({
					text: 'Error retrieving folder. Try again in 3 sec...',
					duration: 3000
				}).showToast();
				setTimeout(() => loadImage(ctx), 3000);
			};
			img.src = url;
		};
		loadImage(canvas.getContext('2d'));
	});
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
