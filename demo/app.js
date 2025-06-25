import { BLEMIDI, MIDIEventType } from "./dist/index.js"

class MIDIDemo {
  constructor() {
    this.device = null
    this.stats = {
      totalMessages: 0,
      noteOn: 0,
      noteOff: 0,
      controlChange: 0,
    }

    this.initializeUI()
  }

  initializeUI() {
    // Check if Web Bluetooth is supported
    if (!BLEMIDI.isSupported()) {
      alert(
        "Your browser does not support Web Bluetooth. Please try using Chrome, Edge, or Opera.",
      )
      document.getElementById("connectButton").disabled = true
      return
    }

    // UI elements
    this.connectButton = document.getElementById("connectButton")
    this.disconnectButton = document.getElementById("disconnectButton")
    this.statusIndicator = document.getElementById("statusIndicator")
    this.statusText = this.statusIndicator.querySelector(".status-text")
    this.deviceNameElement = document.getElementById("deviceName")
    this.deviceIdElement = document.getElementById("deviceId")
    this.connectionStatusElement = document.getElementById("connectionStatus")
    this.messagesContainer = document.getElementById("midiMessages")
    this.clearButton = document.getElementById("clearButton")
    this.autoScrollCheckbox = document.getElementById("autoScroll")
    this.formatRadios = document.querySelectorAll('input[name="format"]')

    // Stats elements
    this.totalMessagesElement = document.getElementById("totalMessages")
    this.noteOnCountElement = document.getElementById("noteOnCount")
    this.noteOffCountElement = document.getElementById("noteOffCount")
    this.ccCountElement = document.getElementById("ccCount")

    // Event listeners
    this.connectButton.addEventListener("click", () => this.connect())
    this.disconnectButton.addEventListener("click", () => this.disconnect())
    this.clearButton.addEventListener("click", () => this.clearMessages())

    // Initialize display format
    this.displayFormat = "hex" // Default format
    this.formatRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.displayFormat = e.target.value
      })
    })
  }

  updateStatus(status, message = "") {
    this.statusIndicator.className = `status-indicator ${status}`

    // Set default messages based on status
    const defaultMessages = {
      connected: "Connected",
      disconnected: "Not Connected",
      connecting: "Connecting...",
    }

    const displayMessage = message || defaultMessages[status] || status
    this.statusText.textContent = displayMessage
    this.connectionStatusElement.textContent = displayMessage

    switch (status) {
      case "connected":
        this.connectButton.disabled = true
        this.disconnectButton.disabled = false
        break
      case "disconnected":
        this.connectButton.disabled = false
        this.disconnectButton.disabled = true
        this.deviceNameElement.textContent = "-"
        this.deviceIdElement.textContent = "-"
        break
      case "connecting":
        this.connectButton.disabled = true
        this.disconnectButton.disabled = true
        break
    }
  }

  updateDeviceInfo(device) {
    this.deviceNameElement.textContent = device.name || "Unknown Device"
    this.deviceIdElement.textContent = device.id || "-"
  }

  async connect() {
    try {
      this.updateStatus("connecting")

      // Scan for a MIDI device
      const device = await BLEMIDI.scan({
        namePrefix: "", // Accept any device
      })

      // Update UI with device info
      this.updateDeviceInfo(device)

      // Set up event listeners
      device.addEventListener(MIDIEventType.MIDIMessage, (event) => {
        this.handleMIDIMessage(event.message)
      })

      device.addEventListener(MIDIEventType.Disconnect, () => {
        this.handleDisconnect()
      })

      // Connect to the device
      await device.connect()
      this.device = device

      this.updateStatus("connected")
      console.log("Connected to device:", device.name)
    } catch (error) {
      if (error.name === "NotFoundError") {
        console.log("User cancelled device selection")
        this.updateStatus("disconnected")
      } else {
        console.error("Connection error:", error)
        this.updateStatus("disconnected", `Connection error: ${error.message}`)
      }
    }
  }

  disconnect() {
    if (this.device) {
      this.device.disconnect()
      this.device = null
      this.updateStatus("disconnected", "Disconnected")
    }
  }

  handleDisconnect() {
    this.device = null
    this.updateStatus("disconnected", "Device disconnected")
  }

  handleMIDIMessage(message) {
    // Update stats
    this.stats.totalMessages++

    // Parse message type
    const statusByte = message.message[0]
    const messageType = statusByte & 0xf0

    // Update specific message type stats
    if (messageType === 0x90 && message.message[2] > 0) {
      // Note On
      this.stats.noteOn++
    } else if (
      messageType === 0x80 ||
      (messageType === 0x90 && message.message[2] === 0)
    ) {
      // Note Off
      this.stats.noteOff++
    } else if (messageType === 0xb0) {
      // Control Change
      this.stats.controlChange++
    }

    // Update stats UI
    this.updateStatsDisplay()

    // Display message
    this.displayMIDIMessage(message)
  }

  updateStatsDisplay() {
    this.totalMessagesElement.textContent = this.stats.totalMessages
    this.noteOnCountElement.textContent = this.stats.noteOn
    this.noteOffCountElement.textContent = this.stats.noteOff
    this.ccCountElement.textContent = this.stats.controlChange
  }

  displayMIDIMessage(message) {
    const messageElement = document.createElement("div")
    messageElement.classList.add("message-item")

    // Add timestamp
    const timestamp = new Date().toLocaleTimeString()
    const timestampSpan = document.createElement("span")
    timestampSpan.classList.add("message-timestamp")
    timestampSpan.textContent = timestamp

    // Add message data
    const dataSpan = document.createElement("span")
    dataSpan.classList.add("message-data")

    // Format message based on selected format
    if (this.displayFormat === "hex") {
      // HEX format: Show raw bytes
      dataSpan.textContent = Array.from(message.message)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
    } else {
      // Parsed format: Show human-readable info
      const statusByte = message.message[0]
      const channel = (statusByte & 0x0f) + 1
      const messageType = statusByte & 0xf0

      if (messageType === 0x90 && message.message[2] > 0) {
        // Note On
        const note = message.message[1]
        const velocity = message.message[2]
        dataSpan.textContent = `Note On: Ch ${channel}, Note ${note} (${this.getNoteNameFromNumber(note)}), Velocity ${velocity}`
        dataSpan.classList.add("message-note-on")
      } else if (
        messageType === 0x80 ||
        (messageType === 0x90 && message.message[2] === 0)
      ) {
        // Note Off
        const note = message.message[1]
        dataSpan.textContent = `Note Off: Ch ${channel}, Note ${note} (${this.getNoteNameFromNumber(note)})`
        dataSpan.classList.add("message-note-off")
      } else if (messageType === 0xb0) {
        // Control Change
        const control = message.message[1]
        const value = message.message[2]
        dataSpan.textContent = `Control Change: Ch ${channel}, CC ${control}, Value ${value}`
        dataSpan.classList.add("message-cc")
      } else if (statusByte === 0xf0) {
        // SysEx
        dataSpan.textContent = `SysEx: ${Array.from(message.message)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`
        dataSpan.classList.add("message-sysex")
      } else {
        // Other messages
        dataSpan.textContent = `MIDI: ${Array.from(message.message)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`
      }
    }

    // Add elements to message item
    messageElement.appendChild(timestampSpan)
    messageElement.appendChild(document.createTextNode(" "))
    messageElement.appendChild(dataSpan)

    // Add to messages container
    this.messagesContainer.appendChild(messageElement)

    // Auto scroll if enabled
    if (this.autoScrollCheckbox.checked) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
    }

    // Limit number of messages (keep last 500)
    while (this.messagesContainer.childElementCount > 500) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild)
    }
  }

  clearMessages() {
    this.messagesContainer.innerHTML = ""
  }

  // Helper to convert MIDI note numbers to note names
  getNoteNameFromNumber(noteNumber) {
    const notes = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ]
    const octave = Math.floor(noteNumber / 12) - 1
    const note = notes[noteNumber % 12]
    return `${note}${octave}`
  }
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", () => {
  const app = new MIDIDemo()
})
