import { MIDI_CHARACTERISTIC_UUID, MIDI_SERVICE_UUID } from "./BLEMIDIConstants"
import { BLEMIDIStreamParser } from "./BLEMIDIStreamParser"
import { DisconnectEvent, MIDIMessageEvent } from "./MIDIEvents"

/**
 * Represents a BLE MIDI device
 */
export class BLEMIDIDevice extends EventTarget {
  private device: BluetoothDevice
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private parser: BLEMIDIStreamParser
  private isConnecting: boolean = false

  /**
   * Creates a BLEMIDIDevice instance
   * @param device The underlying Web Bluetooth device
   */
  constructor(device: BluetoothDevice) {
    super()
    this.device = device

    // Set up disconnect listener
    this.device.addEventListener(
      "gattserverdisconnected",
      this.handleDisconnection.bind(this),
    )

    // Create a single parser instance for this device
    this.parser = new BLEMIDIStreamParser((message) => {
      // Forward MIDI messages as events
      this.dispatchEvent(new MIDIMessageEvent(message))
    })
  }

  /**
   * Get the device name
   * @returns The device name, or null if not available
   */
  get name(): string | undefined {
    return this.device.name
  }

  /**
   * Get the device ID
   * @returns The device ID
   */
  get id(): string {
    return this.device.id
  }

  /**
   * Connect to the MIDI device
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return
    }

    if (this.isConnecting) {
      throw new Error("Connection already in progress")
    }

    this.isConnecting = true

    try {
      // Connect to GATT server
      const server = await this.device.gatt?.connect()
      if (!server) {
        throw new Error("Failed to connect to GATT server")
      }

      // Get MIDI service
      const service = await server.getPrimaryService(MIDI_SERVICE_UUID)

      // Get MIDI characteristic
      this.characteristic = await service.getCharacteristic(
        MIDI_CHARACTERISTIC_UUID,
      )

      // Start notifications
      await this.characteristic.startNotifications()

      // Add value change listener
      this.characteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleMIDICharacteristicValueChanged.bind(this),
      )
    } catch (error) {
      this.characteristic = null
      throw error
    } finally {
      this.isConnecting = false
    }
  }

  /**
   * Disconnect from the MIDI device
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
  }

  /**
   * Check if the device is connected
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false
  }

  /**
   * Handle MIDI characteristic value changes
   * @param event The characteristic value changed event
   * @private
   */
  private handleMIDICharacteristicValueChanged(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (value) {
      this.parser.push(value)
    }
  }

  /**
   * Handle disconnection events
   * @private
   */
  private handleDisconnection(): void {
    const wasConnected = this.characteristic !== null

    this.characteristic = null

    if (wasConnected) {
      this.dispatchEvent(new DisconnectEvent())
    }
  }
}
