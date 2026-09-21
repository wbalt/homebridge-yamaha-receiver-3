const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const InputButton = require('../accessories/InputButton')
const { configuredButtons, syncInputButtons } = require('../lib/inputButtons')
const Yamaha = require('yamaha-nodejs')

class Characteristic extends EventEmitter {
	updateValue(value) { this.value = value; return this }
}
class Service {
	constructor() { this.characteristics = new Map() }
	getCharacteristic(key) {
		if (!this.characteristics.has(key)) this.characteristics.set(key, new Characteristic())
		return this.characteristics.get(key)
	}
	setCharacteristic(key, value) { this.getCharacteristic(key).updateValue(value); return this }
}
class Accessory {
	constructor(name, uuid) { this.displayName = name; this.UUID = uuid; this.context = {}; this.services = new Map() }
	getService(key) { return this.services.get(key) }
	addService(key) { const service = new Service(); this.services.set(key, service); return service }
}
function platform() {
	const calls = { register: [], update: [], unregister: [], log: [] }
	return {
		calls, log: message => calls.log.push(message), PLUGIN_NAME: 'plugin', PLATFORM_NAME: 'platform',
		inputButtonAccessories: new Map(), inputButtonControllers: [],
		api: {
			hap: { Service: { AccessoryInformation: 'information', Switch: 'switch' },
				Characteristic: { Manufacturer: 'manufacturer', Model: 'model', SerialNumber: 'serial', Name: 'name', On: 'on' },
				uuid: { generate: value => value }, Categories: { SWITCH: 8 } },
			platformAccessory: Accessory,
			registerPlatformAccessories: (...args) => calls.register.push(args),
			updatePlatformAccessories: (...args) => calls.update.push(args),
			unregisterPlatformAccessories: (...args) => calls.unregister.push(args)
		}
	}
}
function device() {
	return { id: 'avr-1', model: 'RX', zone1: { name: 'Receiver', inputs: [{ key: 'HDMI1' }, { key: 'HDMI2' }, { key: 'NET RADIO' }] },
		zone2: { active: true, name: 'Zone 2', inputs: [{ key: 'AV1' }] } }
}
const buttonConfig = { id: 'avr-1', model: 'RX', name: 'Apple TV', serial: 'button-1', input: 'HDMI1', zone: 1 }
function button(avr) {
	return new InputButton(avr, platform(), buttonConfig, new Accessory('Apple TV', 'button-1'))
}
function press(controller, value = true) {
	return new Promise((resolve, reject) => controller.set(value, error => error ? reject(error) : resolve()))
}
const success = '<YAMAHA_AV rsp="PUT" RC="0"></YAMAHA_AV>'

test('button sends only real Yamaha Input_Sel XML, never a power command', async () => {
	const avr = new Yamaha('127.0.0.1')
	const commands = []
	avr.SendXMLToReceiver = async xml => { commands.push(xml); return success }
	avr.powerOn = () => assert.fail('must not turn on')
	avr.powerOff = () => assert.fail('must not turn off')
	const control = button(avr)
	await press(control)
	assert.equal(commands.length, 1)
	assert.equal(commands[0], '<YAMAHA_AV cmd="PUT"><Main_Zone><Input><Input_Sel>HDMI1</Input_Sel></Input></Main_Zone></YAMAHA_AV>')
	control.dispose()
})

test('momentary switch resets after callback and can be pressed again; off does nothing', async () => {
	let calls = 0
	const control = button({ setInputTo: async () => { calls++; return success } })
	await press(control, false)
	assert.equal(calls, 0)
	await press(control)
	control.on.updateValue(true) // HomeKit applies a successful write after callback.
	await new Promise(resolve => setTimeout(resolve, 300))
	assert.equal(control.on.value, false)
	control.on.emit('get', (error, value) => { assert.equal(error, null); assert.equal(value, false) })
	await press(control)
	assert.equal(calls, 2)
	control.dispose()
})

test('rejected RC, malformed replies, and transport errors fail without power fallback', async () => {
	for (const response of ['<YAMAHA_AV RC="4"/>', 'not XML', undefined]) {
		const control = button({ setInputTo: async () => response, powerOn: () => assert.fail('power fallback') })
		await assert.rejects(press(control), /Yamaha/)
		control.dispose()
	}
	const control = button({ setInputTo: async () => { throw new Error('offline') } })
	await assert.rejects(press(control), /offline/)
	await new Promise(resolve => setTimeout(resolve, 300))
	assert.equal(control.on.value, false)
	control.dispose()
})

test('overlapping presses share the pending command', async () => {
	let finish, calls = 0
	const control = button({ setInputTo: () => { calls++; return new Promise(resolve => { finish = resolve }) } })
	const first = press(control)
	const second = press(control)
	await Promise.resolve()
	assert.equal(calls, 1)
	finish(success)
	await Promise.all([first, second])
	control.dispose()
})

test('validates input keys, zones, duplicates and XML metacharacters', () => {
	const logs = []
	const d = device()
	d.zone1.inputs.push({ key: '<bad>' })
	const result = configuredButtons({ name: 'AVR', inputButtons: [
		{ input: 'HDMI1', name: 'Apple TV' }, { input: 'HDMI1' },
		{ input: 'AV1', zone: 2 }, { input: 'NET RADIO' },
		{ input: '<bad>' }, { input: 'missing' }, { input: 'HDMI1', zone: 3 },
		{ input: 'AV1', zone: '2' }, { input: 'HDMI1', name: '' }, null
	] }, d, message => logs.push(message))
	assert.deepEqual(result.map(r => [r.input, r.zone]), [['HDMI1', 1], ['AV1', 2], ['NET RADIO', 1]])
	assert.equal(result[0].name, 'Apple TV')
	assert.equal(logs.length, 7)
	d.zone2.active = false
	assert.equal(configuredButtons({ inputButtons: [{ input: 'AV1', zone: 2 }] }, d, () => {}).length, 0)
	assert.deepEqual(configuredButtons({}, d, () => {}), [])
	assert.deepEqual(configuredButtons({ inputButtons: 'HDMI1' }, d, () => {}), [])
})

test('reuses cached identity across rename/reorder, adds and removes bridged buttons', () => {
	const p = platform(), d = device()
	const first = { avr: {}, device: d, config: { inputButtons: [{ input: 'HDMI1' }, { input: 'HDMI2' }] } }
	syncInputButtons(p, [first])
	assert.equal(p.calls.register.length, 2)
	const original = [...p.inputButtonAccessories.values()][0]
	assert.equal(original.context.type, 'input-button')
	// Simulate a Homebridge restart, retaining only its restored accessory objects.
	const restored = platform()
	restored.inputButtonAccessories = p.inputButtonAccessories
	first.config.inputButtons = [{ input: 'HDMI2' }, { input: 'HDMI1', name: 'Renamed' }]
	syncInputButtons(restored, [first])
	assert.equal(restored.calls.register.length, 0)
	assert.equal(restored.calls.update.length, 2)
	assert.equal(restored.inputButtonAccessories.get(original.UUID), original)
	assert.equal(original.displayName, 'Renamed')
	assert.equal(original.getService('switch').getCharacteristic('on').listenerCount('set'), 1)
	syncInputButtons(restored, [])
	assert.equal(restored.calls.unregister.length, 2)
	assert.equal(restored.inputButtonAccessories.size, 0)
})

test('configured zone is passed to the Yamaha command', async () => {
	let received
	const control = new InputButton({ setInputTo: async (...args) => { received = args; return success } },
		platform(), { ...buttonConfig, input: 'AV1', zone: 2 }, new Accessory('Zone 2', 'zone2'))
	await press(control)
	assert.deepEqual(received, ['AV1', 2])
	control.dispose()
})

test('AVR startup applies current button configuration even with an offline cached receiver', async () => {
	const replacements = [
		['yamaha-nodejs', class { async getSystemConfig() { throw new Error('offline') } }],
		['../accessories/Receiver', class {}],
		['../lib/persistMigration', async () => {}]
	]
	const previous = replacements.map(([name]) => [require.resolve(name), require.cache[require.resolve(name)]])
	const avrPath = require.resolve('../lib/avr')
	try {
		for (const [name, exports] of replacements) require.cache[require.resolve(name)] = { exports }
		delete require.cache[avrPath]
		const p = platform()
		p.log.easyDebug = () => {}
		const d = device()
		d.ip = '192.0.2.1'
		d.zone1.volume = {}
		d.zone2.volume = {}
		p.receivers = [{ ip: d.ip, name: 'Receiver', inputButtons: [{ input: 'HDMI1', name: 'Current config' }] }]
		p.storage = { init: async () => {}, getItem: async key => key === 'cachedDevices' ? [d] : {}, setItem: async () => {} }
		await require('../lib/avr').init.call(p)
		assert.equal(p.calls.register.length, 1)
		assert.equal([...p.inputButtonAccessories.values()][0].displayName, 'Current config')
		p.receivers[0].inputButtons = []
		await require('../lib/avr').init.call(p)
		assert.equal(p.calls.unregister.length, 1)
	} finally {
		for (const [path, entry] of previous) {
			if (entry) require.cache[path] = entry
			else delete require.cache[path]
		}
		delete require.cache[avrPath]
	}
})
