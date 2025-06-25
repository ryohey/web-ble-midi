import { MIDI_SERVICE_UUID } from "./BLEMIDIConstants"
import { BLEMIDIDevice } from "./BLEMIDIDevice"

/**
 * Scan filter options for BLE MIDI devices
 */
export interface BLEMIDIScanOptions {
  /**
   * Filter devices by name
   */
  name?: string

  /**
   * Filter devices by name prefix
   */
  namePrefix?: string
}

/**
 * BLEMIDI provides utility functions for working with Bluetooth MIDI devices
 */
export const BLEMIDI = {
  /**
   * Check if Web Bluetooth is supported in this browser
   * @returns True if supported, false otherwise
   */
  isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.bluetooth
  },

  /**
   * Scan for BLE MIDI devices
   * @param options Scan options to filter devices
   * @returns Promise that resolves with a BLEMIDIDevice, or rejects on error or if the user cancels
   */
  async scan(options: BLEMIDIScanOptions = {}): Promise<BLEMIDIDevice> {
    if (!this.isSupported()) {
      throw new Error("Web Bluetooth is not supported in this browser")
    }

    // Create filters based on options
    const filters: Array<BluetoothLEScanFilter> = []
    if (options.name) {
      filters.push({ name: options.name })
    }
    if (options.namePrefix) {
      filters.push({ namePrefix: options.namePrefix })
    }

    // Request device from the browser
    const requestOptions: RequestDeviceOptions = {
      filters,
      optionalServices: [MIDI_SERVICE_UUID],
    }

    // Request a device through the browser's UI
    const device = await navigator.bluetooth.requestDevice(requestOptions)

    // Return a BLEMIDIDevice instance wrapping the selected device
    return new BLEMIDIDevice(device)
  },
}
