# SIM900A GSM Module Setup Guide

## Hardware Connection to Raspberry Pi

### Option 1: Standard UART Connection (Recommended)

| SIM900A Pin | Raspberry Pi GPIO | Description |
|-------------|------------------|-------------|
| VCC         | 5V               | Power supply (2A recommended) |
| GND         | GND              | Ground |
| TXD         | GPIO 15 (RX)     | SIM900A transmit to Pi receive |
| RXD         | GPIO 14 (TX)     | SIM900A receive from Pi transmit |

### Option 2: GPIO4/GPIO5 Connection (Software Serial)

| SIM900A Pin | Raspberry Pi GPIO | Description |
|-------------|------------------|-------------|
| VCC         | DC-DC Converter (5V/2A) | Red |
| GND         | Common GND       | Black |
| TX          | Pin 7 (GPIO4, RXD3) | Blue |
| RX          | Pin 29 (GPIO5, TXD3) | Yellow |

**Note**: GPIO4/GPIO5 are not hardware UART pins. This requires software serial using pigpio library.

### Important Notes:
- **Power**: SIM900A requires 2A current during transmission. Use external power supply or ensure your Pi power supply can handle it
- **Voltage Levels**: SIM900A operates at 3.3V/5V - ensure proper voltage level matching
- **Cross connections**: TX to RX, RX to TX

## Software Configuration

### For GPIO4/GPIO5 Connection (Your Current Setup)

#### 1. Install pigpio Library

```bash
# Install pigpio for software serial
sudo apt-get update
sudo apt-get install pigpio python3-pigpio

# Start pigpio daemon
sudo pigpiod

# Enable pigpio on boot
sudo systemctl enable pigpiod
```

#### 2. Test GPIO4/GPIO5 Connection

```bash
cd /home/chichi/raspberry-pi-server
python3 sim900a_gpio4_gpio5.py
```

#### 3. Integrate with Your Server

Update your `video_server_fastapi.py` to use the GPIO4/GPIO5 class instead of the standard serial class.

### For Standard UART Connection (GPIO14/GPIO15)

#### 1. Enable Serial Port on Raspberry Pi

```bash
# Enable serial port
sudo raspi-config

# Navigate to:
# Interface Options -> Serial Port
# - Enable serial port hardware: YES
# - Enable serial console: NO (to free up the port for SIM900A)

# Reboot after changes
sudo reboot
```

#### 2. Install Required Dependencies

```bash
# Install pyserial for serial communication
pip install pyserial

# Install RPi.GPIO (if not already installed)
pip install RPi.GPIO
```

### 3. Test Serial Connection

```bash
# Check if serial port is available
ls -l /dev/ttyS0

# Test with Python
python3 -c "import serial; print(serial.Serial('/dev/ttyS0', 9600).is_open)"
```

### 4. Configure SIM900A in Code

The `hardware_integration.py` already has SIM900A support. Configure it in your `video_server_fastapi.py`:

```python
# In your hardware manager initialization
config = {
    'enable_sms': True,
    'sim900a_port': '/dev/ttyS0',  # or '/dev/serial0' for Pi 3/4
    'sim900a_baudrate': 9600,
    'emergency_contacts': ['+639123456789', '+639987654321'],  # Add your contacts
    'admin_contacts': ['+639000000000']
}

hardware_manager = HardwareManager(config, db_client)
hardware_manager.initialize()
```

## Testing SIM900A Connection

### 1. Manual AT Command Test

```python
import serial
import time

# Connect to SIM900A
ser = serial.Serial('/dev/ttyS0', 9600, timeout=1)
time.sleep(1)

# Test connection
ser.write(b'AT\r')
response = ser.read(100).decode()
print(f"Response: {response}")  # Should return "OK"

# Check SIM card
ser.write(b'AT+CPIN?\r')
response = ser.read(100).decode()
print(f"SIM Status: {response}")  # Should return "+CPIN: READY"

# Check signal strength
ser.write(b'AT+CSQ\r')
response = ser.read(100).decode()
print(f"Signal: {response}")  # Should return signal quality

# Send test SMS
ser.write(b'AT+CMGF=1\r')  # Set text mode
time.sleep(0.5)
ser.write(b'AT+CMGS="+639123456789"\r')  # Replace with your number
time.sleep(0.5)
ser.write(b'Test message from SIM900A\x1A\r')
time.sleep(2)
response = ser.read(100).decode()
print(f"SMS Status: {response}")

ser.close()
```

### 2. Test with Existing Code

The `hardware_integration.py` has a `SIM900A` class. Test it:

```python
from hardware_integration import SIM900A

# Initialize SIM900A
sim900a = SIM900A(port='/dev/ttyS0', baudrate=9600)

# Connect
if sim900a.connect():
    print("SIM900A connected successfully")
    
    # Send test SMS
    success = sim900a.send_sms(
        phone_number='+639123456789',
        message='Test from CommutAI system'
    )
    print(f"SMS sent: {success}")
else:
    print("Failed to connect to SIM900A")
```

## Troubleshooting

### SIM900A Not Connecting

1. **Check serial port permissions:**
   ```bash
   sudo chmod 666 /dev/ttyS0
   # Or add user to dialout group:
   sudo usermod -a -G dialout chichi
   ```

2. **Verify hardware connections:**
   - Check TX/RX are crossed (TX to RX, RX to TX)
   - Ensure proper ground connection
   - Verify power supply (2A minimum)

3. **Check if another process is using the port:**
   ```bash
   sudo lsof /dev/ttyS0
   ```

4. **Try alternative serial port:**
   - For Pi 3/4: Use `/dev/serial0` instead of `/dev/ttyS0`
   - Update config: `'sim900a_port': '/dev/serial0'`

### SIM Card Issues

1. **Check SIM card status:**
   ```python
   ser.write(b'AT+CPIN?\r')
   # Response should be "+CPIN: READY"
   # If "+CPIN: SIM PIN", you need to enter PIN
   ```

2. **Enter SIM PIN if required:**
   ```python
   ser.write(b'AT+CPIN="1234"\r')  # Replace with your PIN
   ```

3. **Check network registration:**
   ```python
   ser.write(b'AT+CREG?\r')
   # Should return "+CREG: 0,1" or "+CREG: 0,5" (registered)
   ```

### SMS Sending Fails

1. **Check signal strength:**
   ```python
   ser.write(b'AT+CSQ\r')
   # Format: +CSQ: <rssi>,<ber>
   # RSSI values: 0-31 (higher is better), 99 = unknown
   # Values below 10 may have issues
   ```

2. **Check SMS center number:**
   ```python
   ser.write(b'AT+CSCA?\r')
   # Should return your carrier's SMS center
   # If incorrect, set it:
   ser.write(b'AT+CSCA="+639170000000"\r')  # Replace with your carrier's SMSC
   ```

3. **Ensure text mode is set:**
   ```python
   ser.write(b'AT+CMGF=1\r')  # 1 = text mode, 0 = PDU mode
   ```

## Integration with Existing System

The `hardware_integration.py` already integrates SIM900A with:
- Emergency alerts (via `handle_emergency()`)
- Transaction notifications
- Trip completion notifications
- SMS logging to database

### Emergency Contacts Setup

Update your config with emergency contacts:

```python
config = {
    'emergency_contacts': [
        '+639123456789',  # Emergency contact 1
        '+639987654321',  # Emergency contact 2
    ],
    'admin_contacts': [
        '+639000000000',  # Admin contact
    ]
}
```

### SMS Types Supported

- **emergency**: Emergency alerts
- **transaction**: Transaction notifications
- **trip**: Trip completion notifications
- All SMS are logged to `sms_logs` table in Supabase

## Power Considerations

SIM900A can draw up to 2A during transmission. Ensure:
- Use adequate power supply (5V 2.5A recommended)
- Consider separate power supply for SIM900A
- Add capacitor (1000µF) across power lines for stability
- Use thick wires for power connections

## Next Steps

1. Connect hardware as per pinout
2. Enable serial port on Raspberry Pi
3. Install dependencies
4. Test connection with AT commands
5. Configure in `video_server_fastapi.py`
6. Test SMS sending
7. Verify database logging
