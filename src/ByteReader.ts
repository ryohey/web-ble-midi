export class ByteReader {
  private pos: number = 0

  constructor(private readonly dataView: DataView) {}

  eof(): boolean {
    return this.pos >= this.dataView.byteLength
  }

  // Returns the byte in the current position without advancing the position
  peek(): number {
    if (this.pos >= this.dataView.byteLength) {
      throw new Error("Attempted to peek beyond the end of the DataView")
    }
    return this.dataView.getUint8(this.pos)
  }

  readByte(): number {
    const byte = this.peek()
    this.pos++
    return byte
  }

  parseHeader(): number {
    // Header
    const b = this.readByte()
    if ((b & 0xc0) !== 0x80) {
      throw new Error(
        `Invalid MIDI packet: expected header byte to start with 10, got ${b.toString(
          16,
        )}`,
      )
    }
    return b & 0x3f
  }

  parseTimestamp(): number {
    // Timestamp
    const b = this.readByte()
    if ((b & 0x80) !== 0x80) {
      throw new Error(
        `Invalid MIDI packet: expected timestamp byte to start with 10, got ${b.toString(
          16,
        )}`,
      )
    }
    return b & 0x7f
  }

  parseChannelMessage() {
    const firstByte = this.dataView.getUint8(this.pos)
    const length = getChannelMessageLength(firstByte)
    return this.read(length)
  }

  parseSystemMessage(): Uint8Array {
    const firstByte = this.dataView.getUint8(this.pos)
    let length: number
    if ((firstByte & 0xf0) === 0xf0) {
      // System Common Message
      length = getSystemCommonLength(firstByte)
    } else {
      // System Real-Time Message
      length = 1
    }
    return this.read(length)
  }

  read(length: number): Uint8Array {
    if (this.pos + length > this.dataView.byteLength) {
      throw new Error(
        `Invalid read: requested ${length} bytes, but only ${
          this.dataView.byteLength - this.pos
        } bytes available`,
      )
    }
    const bytes = extractUint8Range(this.dataView, this.pos, length)
    this.pos += length
    return bytes
  }
}

function getChannelMessageLength(status: number): number {
  const messageType = (status & 0xf0) >> 4
  switch (messageType) {
    case 0x8: // Note Off
    case 0x9: // Note On
    case 0xa: // Polyphonic Key Pressure
    case 0xb: // Control Change
    case 0xe: // Pitch Bend
      return 3
    default:
      return 2
  }
}

function getSystemCommonLength(status: number): number {
  switch (status) {
    case 0xf1: // MIDI Time Code Quarter Frame
    case 0xf3: // Song Select
      return 2
    case 0xf2: // Song Position Pointer
      return 3
    case 0xf6: // Tune Request
      return 1
    default:
      return 1
  }
}

function extractUint8Range(
  view: DataView,
  start: number,
  length: number,
): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset + start, length)
}
