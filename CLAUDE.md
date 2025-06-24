# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run all tests
npm test

# Run a specific test file
npx jest path/to/test-file.test.ts

# Run a specific test
npx jest -t "test name pattern"
```

## Code Architecture

This library provides functionality for handling BLE MIDI input in web browsers using the Web Bluetooth API. The architecture consists of:

1. **BLEMIDIStreamParser**: The main class that parses BLE-MIDI data packets and emits MIDI messages.
   - Takes a callback function that is called when a complete MIDI message is parsed.
   - Handles the complex state machine for parsing BLE-MIDI data packets.
   - Preserves state across multiple packet fragments (particularly important for SysEx messages).
   - Located in `src/BLEMIDIStreamParser.ts`.

2. **ByteReader**: A utility class for reading bytes from a DataView.
   - Provides methods for reading single bytes, parsing MIDI headers, timestamps, and different MIDI message types.
   - Tracks position in the buffer and performs boundary checking.
   - Located in `src/ByteReader.ts`.

3. **State Machine Implementation**: The parser uses a state machine pattern to handle different MIDI message types:
   - Each state is represented by a function that processes a part of the MIDI stream.
   - States include handling headers, timestamps, channel messages, system messages, and SysEx messages.
   - The state machine is designed to properly handle message interleaving and running status, as defined in the BLE-MIDI specification.

The library implements the BLE-MIDI specification, supporting:
- Regular MIDI messages (note on, note off, control change, etc.)
- System common and real-time messages
- System Exclusive (SysEx) messages (including handling fragmentation across multiple packets)
- Running status for channel messages
- Timestamp handling including overflow detection

This implementation closely follows the BLE-MIDI specification, with particular attention to timestamp handling, running status preservation, and proper SysEx message reassembly across packet boundaries.