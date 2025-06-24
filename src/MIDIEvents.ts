import { MidiMessage } from "./BLEMIDIStreamParser"

/**
 * Event types for BLE MIDI devices
 */
export enum MIDIEventType {
  MIDIMessage = "midimessage",
  Disconnect = "disconnect",
}

/**
 * Custom event for MIDI messages
 */
export class MIDIMessageEvent extends CustomEvent<MidiMessage> {
  constructor(message: MidiMessage) {
    super(MIDIEventType.MIDIMessage, {
      detail: message,
      bubbles: false,
      cancelable: false,
    })
  }

  /**
   * Get the MIDI message
   */
  get message(): MidiMessage {
    return this.detail
  }
}

/**
 * Custom event for disconnection
 */
export class DisconnectEvent extends CustomEvent<void> {
  constructor() {
    super(MIDIEventType.Disconnect, {
      bubbles: false,
      cancelable: false,
    })
  }
}

/**
 * Type declaration for EventTarget to support custom MIDI events
 */
declare global {
  interface EventMap {
    [MIDIEventType.MIDIMessage]: MIDIMessageEvent
    [MIDIEventType.Disconnect]: DisconnectEvent
  }

  interface EventTarget {
    addEventListener<K extends keyof EventMap>(
      type: K,
      listener: (this: EventTarget, ev: EventMap[K]) => any,
      options?: boolean | AddEventListenerOptions,
    ): void

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void

    removeEventListener<K extends keyof EventMap>(
      type: K,
      listener: (this: EventTarget, ev: EventMap[K]) => any,
      options?: boolean | EventListenerOptions,
    ): void

    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void

    dispatchEvent(event: Event): boolean
  }
}
