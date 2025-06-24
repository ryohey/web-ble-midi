import { ByteReader } from "./ByteReader"

export type MidiMessage = {
  timestampMs: number
  message: Uint8Array
}

type MidiCallback = (message: MidiMessage) => void

interface SysExContext {
  timestamp: number
  partialSysExData: number[]
}

export class BLEMIDIStreamParser {
  private callback: MidiCallback
  private sysExContext: SysExContext | null = null

  constructor(callback: MidiCallback) {
    this.callback = callback
  }

  push(dataView: DataView): void {
    // BLE-MIDI packets are a repetition of [header][timestamp][data...][timestamp][data...] ...
    if (dataView.byteLength < 2) return
    const reader = new ByteReader(dataView)
    let state = this.sysExContext
      ? sysExHeaderState(
          this.sysExContext.timestamp,
          this.sysExContext.partialSysExData,
        )
      : headerState

    while (!reader.eof()) {
      const [message, nextState] = state(reader)
      switch (message?.type) {
        case "message":
          // If we have a complete MIDI message, we call the callback
          this.callback({
            timestampMs: message.timestampMs,
            message: message.message,
          })
          // If the message is a SysEx message, we reset the SysEx buffer
          if (message.message[0] === 0xf0) {
            this.sysExContext = null
          }
          break
        case "incompleteSysEx":
          // If we have an incomplete SysEx message, we store it in the context
          this.sysExContext = {
            timestamp: message.timestamp,
            partialSysExData: message.data,
          }
          break
      }
      if (nextState === null) {
        // If the next state is null, we have reached the end of the stream
        break
      }
      state = nextState
    }
  }
}

type ParserResult =
  | {
      type: "message"
      timestampMs: number
      message: Uint8Array
    }
  | {
      type: "incompleteSysEx"
      timestamp: number
      data: number[]
    }
  | null

type ParserState = (reader: ByteReader) => [ParserResult, ParserState | null]

interface RunningStatus {
  statusByte: number
  length: number
}

const headerState: ParserState = (reader) => {
  const timestampHigh = reader.parseHeader()
  return [null, firstTimestampState(timestampHigh)]
}

const firstTimestampState =
  (timestampHigh: number): ParserState =>
  (reader) => {
    const timestampLow = reader.parseTimestamp()
    const timestamp = (timestampHigh << 7) | timestampLow
    const nextByte = reader.peek()

    // Check if the next byte is a SysEx start (0xf0)
    if (nextByte === 0xf0) {
      return [null, sysExStartState(timestamp)]
    }
    return [null, fullMessageState(timestamp)]
  }

const fullMessageState =
  (timestamp: number): ParserState =>
  (reader) => {
    const messageBody = reader.parseChannelMessage()
    const message: ParserResult = {
      type: "message",
      timestampMs: timestamp,
      message: messageBody,
    }
    if (reader.eof()) {
      // If we reach the end of the stream, we return the message and null for the next state
      return [message, null]
    }
    const runningStatus = {
      statusByte: messageBody[0],
      length: messageBody.length,
    }
    const nextByte = reader.peek()
    if ((nextByte & 0x80) === 0x80) {
      // If the next byte is a timestamp, we return the timestamp state
      return [message, timestampState(timestamp, runningStatus)]
    } else {
      // If the next byte is not a timestamp, we assume it's a running status
      return [message, runningStatusState(timestamp, runningStatus)]
    }
  }

const sysExHeaderState =
  (timestamp: number, partialSysExData: number[]): ParserState =>
  (reader) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _timestampHigh = reader.parseHeader() // ignore the header byte

    // In a packet during SysEx reception, data comes immediately after the header
    const nextByte = reader.peek()
    if (nextByte === 0xf7) {
      return [null, sysExEndState(timestamp, partialSysExData)]
    }
    if (nextByte & 0x80) {
      return [null, sysExSystemMessageState(timestamp, partialSysExData)]
    }
    return [null, sysExDataState(timestamp, partialSysExData)]
  }

const systemMessageState =
  (timestamp: number, runningStatus: RunningStatus): ParserState =>
  (reader) => {
    const messageBody = reader.parseSystemMessage()
    const message: ParserResult = {
      type: "message",
      timestampMs: timestamp,
      message: messageBody,
    }
    if (reader.eof()) {
      // If we reach the end of the stream, we return the message and null for the next state
      return [message, null]
    }
    // Verify if the next byte is a timestamp
    const nextByte = reader.peek()
    if ((nextByte & 0x80) !== 0x80) {
      throw new Error(
        `Invalid MIDI packet: expected next byte to be a timestamp, got ${nextByte.toString(
          16,
        )}`,
      )
    }
    return [message, timestampState(timestamp, runningStatus)]
  }

const sysExDataState =
  (timestamp: number, partialSysExData: number[]): ParserState =>
  (reader) => {
    // Read SysEx data that continues with 0-starting data
    const sysExData: number[] = [...partialSysExData]
    while (!reader.eof()) {
      const nextByte = reader.peek()
      if ((nextByte & 0x80) === 0) {
        // If the next byte is a data byte (0-127), we read it
        sysExData.push(reader.readByte())
      } else if (nextByte === 0xf7) {
        // If the next byte is a SysEx end (0xf7), we return the SysEx data
        const message: ParserResult = {
          type: "message",
          timestampMs: timestamp,
          message: new Uint8Array([0xf0, ...sysExData, 0xf7]),
        }
        if (reader.eof()) {
          // If we reach the end of the stream, we return the message and null for the next state
          return [message, null]
        }
        return [message, firstTimestampState(timestamp >> 7)]
      } else {
        return [null, sysExTimestampState(timestamp >> 7, sysExData)]
      }
    }
    // eof
    return [
      {
        type: "incompleteSysEx",
        timestamp,
        data: sysExData,
      },
      null,
    ]
  }

// Handling when a system message arrives during SysEx reception
const sysExSystemMessageState =
  (timestamp: number, partialSysExData: number[]): ParserState =>
  (reader) => {
    const messageBody = reader.parseSystemMessage()
    const message: ParserResult = {
      type: "message",
      timestampMs: timestamp,
      message: messageBody,
    }
    if (reader.eof()) {
      // If we reach the end of the stream, we return the message and null for the next state
      return [message, null]
    }
    const nextByte = reader.peek()
    if ((nextByte & 0x80) === 0x80) {
      return [message, sysExTimestampState(timestamp, partialSysExData)]
    }
    return [message, sysExDataState(timestamp, partialSysExData)]
  }

// Handling when a timestamp arrives during SysEx reception
const sysExTimestampState =
  (lastTimestamp: number, partialSysExData: number[]): ParserState =>
  (reader) => {
    const timestampLow = reader.parseTimestamp()
    const timestamp = getFixedTimestamp(lastTimestamp, timestampLow)
    const nextByte = reader.peek()
    if (nextByte === 0xf7) {
      return [null, sysExEndState(timestamp, partialSysExData)]
    }
    if (nextByte & 0x80) {
      return [null, sysExSystemMessageState(timestamp, partialSysExData)]
    }
    return [null, sysExDataState(timestamp, partialSysExData)]
  }

const sysExStartState =
  (timestamp: number): ParserState =>
  (reader) => {
    reader.readByte() // Read the SysEx start byte (0xf0)
    return [null, sysExDataState(timestamp, [])]
  }

const sysExEndState =
  (timestamp: number, partialSysExData: number[]): ParserState =>
  (reader) => {
    reader.readByte() // Read the SysEx end byte (0xf7)
    // If the next byte is a SysEx end (0xf7), we return the SysEx data
    const message: ParserResult = {
      type: "message",
      timestampMs: timestamp,
      message: new Uint8Array([0xf0, ...partialSysExData, 0xf7]),
    }
    if (reader.eof()) {
      // If we reach the end of the stream, we return the message and null for the next state
      return [message, null]
    }
    return [message, firstTimestampState(timestamp >> 7)]
  }

function getFixedTimestamp(
  lastTimestamp: number,
  timestampLow: number,
): number {
  const timestamp = (lastTimestamp & 0x70) | timestampLow
  if (timestamp < lastTimestamp) {
    // If the timestamp is less than the last timestamp, it indicates an overflow
    const timestampHigh = (lastTimestamp >> 7) + 1
    return (timestampHigh << 7) | timestampLow
  }
  return timestamp
}

const timestampState =
  (lastTimestamp: number, runningStatus: RunningStatus): ParserState =>
  (reader) => {
    const timestampLow = reader.parseTimestamp()
    const timestamp = getFixedTimestamp(lastTimestamp, timestampLow)
    const nextByte = reader.peek()
    if ((nextByte & 0xf0) === 0xf0) {
      // Check sysex start
      if (nextByte === 0xf0) {
        return [null, sysExStartState(timestamp)]
      } else if (nextByte === 0xf7) {
        // If SysEx end (0xf7) is received without SysEx start (0xf0), it's an error
        throw new Error(
          `Invalid MIDI packet: SysEx end (0xf7) received without SysEx start (0xf0)`,
        )
      } else {
        return [null, systemMessageState(timestamp, runningStatus)]
      }
    } else if ((nextByte & 0x80) === 0x80) {
      return [null, fullMessageState(timestamp)]
    } else {
      // If the next byte is not a timestamp, we assume it's a running status
      return [null, runningStatusState(timestamp, runningStatus)]
    }
  }

const runningStatusState =
  (timestamp: number, runningStatus: RunningStatus): ParserState =>
  (reader) => {
    const messageData = reader.read(runningStatus.length - 1)
    const messageBody = new Uint8Array([
      runningStatus.statusByte,
      ...Array.from(messageData),
    ])
    const message: ParserResult = {
      type: "message",
      timestampMs: timestamp,
      message: messageBody,
    }
    if (reader.eof()) {
      // If we reach the end of the stream, we return the message and null for the next state
      return [message, null]
    }
    const nextByte = reader.peek()
    if ((nextByte & 0x80) === 0x80) {
      // If the next byte is a timestamp, we return the timestamp state
      return [message, timestampState(timestamp, runningStatus)]
    } else {
      // If the next byte is not a timestamp, we assume it's a running status
      return [message, runningStatusState(timestamp, runningStatus)]
    }
  }
