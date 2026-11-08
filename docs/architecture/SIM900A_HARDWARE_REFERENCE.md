# SIM900A Hardware Connection Reference

## Quick Reference

### SIM900A Pinout
```
┌─────────────────────────────────┐
│  SIM900A Module Pinout          │
├─────────────────────────────────┤
│  NET  - Network LED (blue)      │
│  RST  - Reset (active low)      │
│  RXD  - Receive Data            │
│  TXD  - Transmit Data           │
│  GND  - Ground                  │
│  VCC  - Power (5V)              │
└─────────────────────────────────┘
```

### Raspberry Pi GPIO Header (40-pin)
```
┌─────────────────────────────────────────┐
│  (2) 5V   (4) 5V   (6) GND  (8) TXD     │
│  (30) GND  (32) GPIO12  (34) GND       │
│  (7) GPIO4  (29) GPIO5                 │
└─────────────────────────────────────────┘
```

## Connection Diagrams

### Option 1: USB-TTL Adapter (Recommended)

```
SIM900A          USB-TTL (CP2102)      Raspberry Pi
--------         -----------------     --------------
VCC (5V)   ───►  VCC (5V)          ───►  USB 5V
GND        ───►  GND               ───►  USB GND
TXD        ───►  RXD               ───►  USB Data
RXD        ───►  TXD               ───►  USB Data
```

**Advantages:**
- Easy to connect/disconnect
- No GPIO pin usage
- Works with any computer (not just Pi)
- Built-in USB drivers

**Disadvantages:**
- Requires USB-TTL adapter
- Uses USB port

**Port on Pi:** `/dev/ttyUSB0` or `/dev/ttyACM0`

### Option 2: Direct GPIO Connection (GPIO4/GPIO5)

```
SIM900A          Raspberry Pi GPIO
--------         ----------------
VCC (5V)   ───►  Pin 2 or 4 (5V)
GND        ───►  Pin 6, 14, 20, 25, 30, 34, or 39 (GND)
TXD        ───►  Pin 7 (GPIO4) - Pi's RX
RXD        ───►  Pin 29 (GPIO5) - Pi's TX
```

**IMPORTANT:** TXD connects to Pi's RX, RXD connects to Pi's TX (cross-connection)

**Advantages:**
- No USB adapter needed
- Uses existing GPIO pins
- More compact setup

**Disadvantages:**
- Requires pigpio library
- More complex setup
- Uses GPIO pins (can't use for other purposes)

**Port on Pi:** Software serial on GPIO4/GPIO5

## Power Requirements

### SIM900A Power Needs
- **Operating Voltage:** 4.8V - 5.2V (typical 5V)
- **Peak Current:** Up to 2A during transmission
- **Idle Current:** ~15-30mA
- **Transmission Current:** ~200-500mA average, peaks to 2A

### Power Supply Recommendations

**For USB-TTL:**
- Use powered USB hub or adequate power supply
- Ensure USB port can supply 500mA+

**For GPIO:**
- Use dedicated 5V power supply capable of 2A
- Do NOT power from Pi's 5V pin (insufficient current)
- Connect GND of power supply to Pi's GND

## Pin Number Reference

### Raspberry Pi 40-Pin Header

```
          ┌──────────────────────────────────────┐
   3.3V  │ 1  ( )  2  ( )  5V                  │
   GPIO2 │ 3  ( )  4  ( )  5V                  │
   GPIO3 │ 5  ( )  6  ( )  GND                 │
   GPIO4 │ 7  ( )  8  ( )  TXD (GPIO14)        │
   GND   │ 9  ( ) 10  ( )  RXD (GPIO15)        │
  GPIO17 │11  ( ) 12  ( )  GPIO18              │
  GPIO27 │13  ( ) 14  ( )  GND                 │
  GPIO22 │15  ( ) 16  ( )  GPIO23              │
    3.3V │17  ( ) 18  ( )  GPIO24              │
  GPIO10 │19  ( ) 20  ( )  GND                 │
   GPIO9 │21  ( ) 22  ( )  GPIO25              │
  GPIO11 │23  ( ) 24  ( )  GPIO8               │
    GND  │25  ( ) 26  ( )  GPIO7               │
          │ 27  ( ) 28  ( )                     │
    ID_SD│29  ( ) 30  ( )  GND                 │
    ID_SC│31  ( ) 32  ( )  GPIO12              │
  GPIO13 │33  ( ) 34  ( )  GND                 │
  GPIO19 │35  ( ) 36  ( )  GPIO16              │
  GPIO26 │37  ( ) 38  ( )  GPIO20              │
    GND  │39  ( ) 40  ( )  GPIO21              │
          └──────────────────────────────────────┘
```

**Key Pins for SIM900A:**
- Pin 2 or 4: 5V power
- Pin 6, 14, 20, 25, 30, 34, 39: GND
- Pin 7: GPIO4 (RX for GPIO connection)
- Pin 29: GPIO5 (TX for GPIO connection)

## Common USB-TTL Adapters

### CP2102 (Silicon Labs)
- **Port:** `/dev/ttyUSB0`
- **Drivers:** Usually included in Linux kernel
- **LED:** Activity LED (helpful for debugging)

### FT232 (FTDI)
- **Port:** `/dev/ttyUSB0`
- **Drivers:** Usually included in Linux kernel
- **Reliable:** Very stable and well-supported

### CH340 (Cheap alternative)
- **Port:** `/dev/ttyUSB0` or `/dev/ttyACM0`
- **Drivers:** May need to install: `sudo apt-get install ch340-dkms`
- **Budget:** Cheapest option

## Serial Port Detection

### List all serial ports on Raspberry Pi:

```bash
# USB serial ports
ls -la /dev/ttyUSB*
ls -la /dev/ttyACM*

# Hardware serial ports (UART)
ls -la /dev/ttyS*
ls -la /dev/serial*

# Or use dmesg to see connected devices
dmesg | grep tty
```

### Check USB devices:

```bash
lsusb
```

Expected output for USB-TTL:
```
Bus 001 Device 005: ID 10c4:ea60 Silicon Labs CP210x UART Bridge
```

## Wiring Checklist

- [ ] SIM900A VCC connected to 5V
- [ ] SIM900A GND connected to GND
- [ ] SIM900A TXD connected to adapter RX (or Pi GPIO4)
- [ ] SIM900A RXD connected to adapter TX (or Pi GPIO5)
- [ ] SIM900A antenna connected
- [ ] SIM card inserted
- [ ] Adequate power supply (2A capable)
- [ ] Grounds connected together (if using external power)

## Testing Connections

### Multimeter Check (if available):
1. **Voltage check:** Measure between VCC and GND = 4.8V-5.2V
2. **Continuity check:** Verify all connections have continuity
3. **No shorts:** Check for accidental short circuits

### LED Indicators on SIM900A:
- **PWR LED:** Should be on (power is connected)
- **NET LED (Blue):** Blinks when registered to network
  - 1 blink every 3 seconds = registered to network
  - Fast blinking = searching for network
  - Off = not powered or no SIM

## Troubleshooting Hardware

### No power LED on SIM900A:
- Check 5V supply
- Check GND connection
- Try different power source

### NET LED not blinking:
- SIM card not inserted
- SIM card not activated
- No signal
- Antenna not connected

### No response to AT commands:
- Wrong baudrate (try 9600, 115200, 19200)
- TX/RX reversed
- Wrong port
- Permissions issue (add user to dialout group)

### Weak or no signal:
- Move to location with better coverage
- Check antenna
- Try SIM card in phone to verify
- Check SIM card is activated

## Safety Precautions

⚠️ **IMPORTANT:**
1. **Always disconnect power before wiring**
2. **Never connect VCC to 3.3V** - SIM900A needs 5V
3. **Don't exceed 5.2V** - can damage module
4. **Use adequate power supply** - peaks to 2A
5. **Cross-connect TX/RX** - TX→RX, RX→TX
6. **Common ground** - Connect all GNDs together
7. **Antenna required** - never operate without antenna
8. **Check for shorts** before powering on

## Reference Resources

- SIM900A Datasheet: https://www.google.com/search?q=SIM900A+datasheet
- Raspberry Pi GPIO Pinout: https://pinout.xyz/
- CP2102 Drivers: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
