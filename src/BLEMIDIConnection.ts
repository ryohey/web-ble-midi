import { BLEMIDIStreamParser, MidiMessage } from "./BLEMIDIStreamParser"

export const MIDI_SERVICE_UUID =
  "03b80e5a-ede8-4b33-a751-6ce34ec4c700".toLowerCase()
export const MIDI_CHARACTERISTIC_UUID =
  "7772e5db-3868-4112-a1a9-f2669d106bf3".toLowerCase()

export interface BLEMIDIConnectionOptions {
  /**
   * Filter devices by name
   */
  name?: string
  /**
   * Filter devices by name prefix
   */
  namePrefix?: string
  /**
   * Called when a MIDI message is received
   */
  onMIDIMessage?: (message: MidiMessage) => void
  /**
   * Called when the device is disconnected
   */
  onDisconnect?: () => void
}

export class BLEMIDIConnection {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private parser: BLEMIDIStreamParser
  private options: BLEMIDIConnectionOptions

  constructor(options: BLEMIDIConnectionOptions = {}) {
    this.options = options
    this.parser = new BLEMIDIStreamParser((message) => {
      this.options.onMIDIMessage?.(message)
    })
  }

  /**
   * Connect to a BLE MIDI device
   * @returns The connected device
   * @throws Error if Web Bluetooth is not supported or connection fails
   */
  async connect(): Promise<BluetoothDevice> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth is not supported in this browser")
    }

    try {
      const filters: Array<BluetoothRequestDeviceFilter> = []

      // Add name filter if provided
      if (this.options.name) {
        filters.push({ name: this.options.name })
      }

      // Add namePrefix filter if provided
      if (this.options.namePrefix) {
        filters.push({ namePrefix: this.options.namePrefix })
      }

      // Request device with filters, or fall back to serviceUUID only
      const requestOptions: RequestDeviceOptions = {
        filters: filters.length > 0 ? filters : undefined,
        optionalServices: [MIDI_SERVICE_UUID],
      }

      // If no filters are specified, use acceptAllDevices
      if (!filters.length) {
        requestOptions.acceptAllDevices = true
      }

      // Request the device from the user
      this.device = await navigator.bluetooth.requestDevice(requestOptions)

      // Add disconnect listener
      this.device.addEventListener("gattserverdisconnected", () => {
        this.handleDisconnection()
      })

      // Connect to the device
      const server = await this.device.gatt?.connect()
      if (!server) {
        throw new Error("Failed to connect to GATT server")
      }

      // Get the MIDI service
      const service = await server.getPrimaryService(MIDI_SERVICE_UUID)

      // Get the MIDI characteristic
      this.characteristic = await service.getCharacteristic(
        MIDI_CHARACTERISTIC_UUID,
      )

      // Start notifications
      await this.characteristic.startNotifications()

      // Add value change listener
      this.characteristic.addEventListener(
        "characteristicvaluechanged",
        (event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic)
            .value
          if (value) {
            this.parser.push(value)
          }
        },
      )

      return this.device
    } catch (error) {
      this.device = null
      this.characteristic = null
      throw error
    }
  }

  /**
   * Disconnect from the current BLE MIDI device
   */
  disconnect(): void {
    if (this.characteristic) {
      try {
        this.characteristic.stopNotifications().catch((error) => {
          console.error("Error stopping notifications:", error)
        })
      } catch (error) {
        console.error("Error stopping notifications:", error)
      }

      this.characteristic = null
    }

    if (this.device?.gatt?.connected) {
      try {
        this.device.gatt.disconnect()
      } catch (error) {
        console.error("Error disconnecting device:", error)
      }
    }

    this.device = null
  }

  /**
   * Check if currently connected to a device
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false
  }

  /**
   * Get the currently connected device
   * @returns The connected device or null if not connected
   */
  getDevice(): BluetoothDevice | null {
    return this.device
  }

  private handleDisconnection(): void {
    this.characteristic = null
    this.device = null
    this.options.onDisconnect?.()
  }
}
