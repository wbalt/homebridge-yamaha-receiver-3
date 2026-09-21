<img src="branding/yamaha_homebridge.png" width="500px">

# homebridge-yamaha-receiver

[![Downloads](https://img.shields.io/npm/dt/homebridge-yamaha-receiver.svg?color=critical)](https://www.npmjs.com/package/homebridge-yamaha-receiver)
[![Version](https://img.shields.io/npm/v/homebridge-yamaha-receiver)](https://www.npmjs.com/package/homebridge-yamaha-receiver)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

[Homebridge](https://github.com/nfarina/homebridge) plugin for Yamaha Audio Receivers


  <img src="branding/product.png" width="300">

### Requirements


<img src="https://img.shields.io/badge/node-%3E%3D10.17-brightgreen"> &nbsp;
<img src="https://img.shields.io/badge/homebridge-%3E%3D1.1.6-brightgreen">

- [x] Set static IP for the receiver
- [x] Turn on "Network Stand-By" in the receiver settings
- [x] Check Node Version with `node -v`
- [x] Check Homebridge version with `homebridge -V`

## Support homebridge-yamaha-receiver

**homebridge-yamaha-receiver** is a free plugin under the MIT license. it was developed as a contribution to the homebridge/hoobs community with lots of love and thoughts.
Creating and maintaining Homebridge plugins consume a lot of time and effort and if you would like to share your appreciation, feel free to "Star" or donate.

<a target="blank" href="https://www.paypal.me/nitaybz"><img src="https://img.shields.io/badge/PayPal-Donate-blue.svg?logo=paypal"/></a><br>
<a target="blank" href="https://www.patreon.com/nitaybz"><img src="https://img.shields.io/badge/PATREON-Become a patron-red.svg?logo=patreon"/></a><br>
<a target="blank" href="https://ko-fi.com/nitaybz"><img src="https://img.shields.io/badge/Ko--Fi-Buy%20me%20a%20coffee-29abe0.svg?logo=ko-fi"/></a>

## Input buttons without powering on

Add optional `inputButtons` to a receiver configuration:

```json
"inputButtons": [
  { "name": "Apple TV Input", "input": "HDMI1", "zone": 1 },
  { "name": "TV Input", "input": "HDMI2", "zone": 1 }
]
```

Use the exact Yamaha input key (such as `HDMI1`, `AV1`, or `NET RADIO`), not
an input's custom HomeKit name. Debug startup logs show the available input keys.
`name` is optional; `zone` defaults to 1. Other zones must be supported and enabled
in the existing receiver configuration. Invalid or duplicate buttons are skipped
with a log message. Omit the option or use `[]` to disable all input buttons.

After restarting Homebridge, these buttons appear as regular switches on the
Homebridge bridge. Each press selects its input and the switch automatically
returns to off. An off command does nothing. Buttons do not indicate receiver
power or the currently selected input. Names/order may be changed without
creating new accessory identities; removing entries removes their accessories
on restart. The existing externally paired TV receiver remains unchanged.

The button sends **only an input-selection command**, never a power-on command.
Enable Network Standby on the receiver. Whether input selection/HDMI passthrough
works during standby depends on the model and receiver settings. Rejected
commands are reported as errors; there is no power-on fallback. Firmware,
HDMI-CEC, and external automations can still affect power independently.
The existing TV input selector retains its previous power-on behavior.

Development checks: `npm test` and `npm run lint`.
See [the architecture description (German)](docs/ARCHITEKTUR.md) for component
responsibilities, data flows, persistence, and limitations. Hardware behavior and
Home app presentation still require validation on the target installation.
