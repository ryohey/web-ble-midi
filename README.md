[![npm version](https://badge.fury.io/js/web-ble-midi.svg)](https://badge.fury.io/js/web-ble-midi) [![Actions Status](https://github.com/ryohey/web-ble-midi/workflows/CI/badge.svg?branch=master)](https://github.com/ryohey/web-ble-midi/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# web-ble-midi

A library for easily handling BLE MIDI input in the browser.

## Installation

```bash
npm install web-ble-midi --save
```

## Usage

```ts
import { read } from "web-ble-midi"
```

## Parser State Machine

The MIDI parser in this library operates according to the following state machine:

```mermaid
stateDiagram-v2
    [*] --> sysExHeader: SysEx receiving
    [*] --> header: otherwise

    sysExHeader --> sysExEnd: 0xf7
    sysExHeader --> sysExSystem: 0x80-0xff
    sysExHeader --> sysExData: 0x00-0x7f

    sysExData --> sysExEnd: 0xf7
    sysExData --> sysExSystem: 0x80-0xff
    sysExData --> sysExTimestamp: timestamp
    sysExData --> sysExData: 0x00-0x7f

    sysExSystem --> sysExTimestamp: timestamp
    sysExSystem --> sysExData: 0x00-0x7f

    sysExTimestamp --> sysExEnd: 0xf7
    sysExTimestamp --> sysExSystem: 0x80-0xff
    sysExTimestamp --> sysExData: 0x00-0x7f

    sysExEnd --> header

    header --> firstTimestamp

    firstTimestamp --> sysExStart: 0xf0
    firstTimestamp --> fullMessage: others

    sysExStart --> sysExData

    fullMessage --> timestamp

    timestamp --> sysExStart: 0xf0
    timestamp --> fullMessage: 0x80-0xef
    timestamp --> runningStatus: 0x00-0x7f
    timestamp --> system: 0xf1-0xff
    timestamp --> [*]: end

    runningStatus --> timestamp
    runningStatus --> runningStatus

    system --> timestamp
```
