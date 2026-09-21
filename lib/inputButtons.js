const InputButton = require('../accessories/InputButton')

function configuredButtons(config, device, log) {
	if (config.inputButtons === undefined) return []
	if (!Array.isArray(config.inputButtons)) {
		log(`${config.name} - inputButtons must be an array`)
		return []
	}
	const seen = new Set()
	return config.inputButtons.flatMap(button => {
		if (!button || typeof button !== 'object' || typeof button.input !== 'string') {
			log(`${config.name} - Skipping invalid input button`)
			return []
		}
		const zone = button.zone === undefined ? 1 : button.zone
		const zoneConfig = device[`zone${zone}`]
		const input = button.input.trim()
		if (!Number.isInteger(zone) || zone < 1 || zone > 4 || !zoneConfig ||
			(zone !== 1 && !zoneConfig.active) || !zoneConfig.inputs.some(row => row.key === input) ||
			/[<>&"']/.test(input) || (button.name !== undefined &&
				(typeof button.name !== 'string' || !button.name.trim()))) {
			log(`${config.name} - Skipping input button: invalid input, name, or inactive zone (${input}, ${zone})`)
			return []
		}
		const serial = `${device.id}_zone${zone}_input_button_${input}`
		if (seen.has(serial)) {
			log(`${config.name} - Skipping duplicate input button (${input}, ${zone})`)
			return []
		}
		seen.add(serial)
		return [{ id: device.id, model: device.model, zone, input, serial,
			name: button.name ? button.name.trim() : `${zoneConfig.name} ${input}` }]
	})
}

function syncInputButtons(platform, receivers) {
	const wanted = new Set()
	platform.inputButtonControllers = []
	for (const { avr, config, device } of receivers) {
		for (const button of configuredButtons(config, device, platform.log)) {
			const uuid = platform.api.hap.uuid.generate(button.serial)
			if (wanted.has(uuid)) continue
			wanted.add(uuid)
			const cached = platform.inputButtonAccessories.get(uuid)
			const accessory = cached || new platform.api.platformAccessory(button.name, uuid, platform.api.hap.Categories.SWITCH)
			platform.inputButtonControllers.push(new InputButton(avr, platform, button, accessory))
			if (cached) platform.api.updatePlatformAccessories([accessory])
			else platform.api.registerPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, [accessory])
			platform.inputButtonAccessories.set(uuid, accessory)
		}
	}
	for (const [uuid, accessory] of platform.inputButtonAccessories) {
		if (!wanted.has(uuid)) {
			platform.api.unregisterPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, [accessory])
			platform.inputButtonAccessories.delete(uuid)
		}
	}
}

module.exports = { configuredButtons, syncInputButtons }
