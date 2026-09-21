// A writable, momentary HomeKit switch. Never use the TV input setter here:
// that setter deliberately powers the receiver on before changing inputs.
class InputButton {
	constructor(avr, platform, config, accessory) {
		const { Service, Characteristic } = platform.api.hap
		this.avr = avr
		this.config = config
		this.log = platform.log
		this.pending = null
		this.resetTimer = null
		this.accessory = accessory
		accessory.displayName = config.name
		accessory.context = { ...accessory.context, type: 'input-button', deviceId: config.id,
			input: config.input, zone: config.zone }
		const information = accessory.getService(Service.AccessoryInformation) ||
			accessory.addService(Service.AccessoryInformation)
		information.setCharacteristic(Characteristic.Manufacturer, 'Yamaha')
			.setCharacteristic(Characteristic.Model, config.model || 'unknown')
			.setCharacteristic(Characteristic.SerialNumber, config.serial)
		this.service = accessory.getService(Service.Switch) || accessory.addService(Service.Switch, config.name)
		this.service.setCharacteristic(Characteristic.Name, config.name)
		this.on = this.service.getCharacteristic(Characteristic.On)
		this.on.removeAllListeners('get')
		this.on.removeAllListeners('set')
		this.on.on('get', callback => callback(null, false))
			.on('set', this.set.bind(this)).updateValue(false)
	}

	async set(value, callback) {
		if (!value) {
			callback()
			return
		}
		clearTimeout(this.resetTimer)
		let error
		try {
			if (!this.pending) {
				this.pending = Promise.resolve().then(() => this.avr.setInputTo(this.config.input, this.config.zone))
					.then(response => {
						const match = typeof response === 'string' && response.match(/<YAMAHA_AV\b[^>]*\bRC\s*=\s*["'](\d+)["']/i)
						if (!match || match[1] !== '0')
							throw new Error(match ? `Yamaha rejected input selection (RC=${match[1]})` : 'Invalid Yamaha input response')
					})
					.finally(() => { this.pending = null })
			}
			await this.pending
		} catch (err) {
			error = err
			this.log(`${this.config.name} - Input selection failed: ${err.message}`)
		}
		callback(error)
		// Run after HomeKit finishes applying the write, without calling our setter.
		clearTimeout(this.resetTimer)
		this.resetTimer = setTimeout(() => this.on.updateValue(false), 250)
		this.resetTimer.unref()
	}

	dispose() {
		clearTimeout(this.resetTimer)
	}
}

module.exports = InputButton
