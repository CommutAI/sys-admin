# SMS Testing Instructions for SIM900A

## Prerequisites

### Hardware Requirements
- SIM900A GSM Module
- USB-TTL Adapter (CP2102, FT232, or similar) OR direct GPIO connection
- SIM card with active data/SMS plan
- Raspberry Pi (any model with USB or GPIO access)

### Software Requirements
- Python 3 installed on Raspberry Pi
- pyserial library: `pip install pyserial`
- If using GPIO connection: pigpio library: `pip install pigpio`

## Hardware Connection Options

### Option 1: USB-TTL Adapter (Recommended - Easier)

**Wiring:**
```
SIM900A    USB-TTL    Raspberry Pi
-------    --------    ------------
VCC        5V         USB Power
GND        GND        USB GND
TXD        RX         -
RXD        TX         -
```

**Port:** `/dev/ttyUSB0` or `/dev/ttyACM0`

### Option 2: GPIO4/GPIO5 (Advanced - Direct Connection)

**Wiring:**
```
SIM900A    Raspberry Pi GPIO
-------    -----------------
VCC        5V (Pin 2 or 4)
GND        GND (Pin 6, 14, 20, 25, 30, 34, 39)
TXD        GPIO4 (Pin 7) - Connect to Pi's RX
RXD        GPIO5 (Pin 29) - Connect to Pi's TX
```

**Note:** TXD connects to RX and RXD connects to TX (cross-connection)

## Testing Steps

### Step 1: Prepare the Raspberry Pi

1. **Connect to your Raspberry Pi via SSH:**
   ```bash
   ssh pi@<raspberry-pi-ip>
   ```

2. **Navigate to the project directory:**
   ```bash
   cd /path/to/sys-admin/raspberry-pi-server
   ```

3. **Install required dependencies:**
   ```bash
   pip install pyserial
   # If using GPIO connection:
   pip install pigpio
   ```

4. **Check USB ports (if using USB-TTL):**
   ```bash
   ls -la /dev/ttyUSB*
   ls -la /dev/ttyACM*
   ```

5. **Check if user has serial permissions:**
   ```bash
   groups $USER
   ```
   If `dialout` is not in the list, add it:
   ```bash
   sudo usermod -a -G dialout $USER
   # Then reboot
   sudo reboot
   ```

### Step 2: Run Connection Test (No SMS sent)

Run the test script without a phone number to check connection only:

```bash
python3 test_sms_send.py
```

This will test:
- SIM900A module response
- Signal strength
- SIM card status
- Network registration
- Network operator

**Expected Output:**
```
======================================================================
📱 SIM900A SMS Test
======================================================================

✅ Connected to /dev/ttyUSB0 @ 9600 baud

[1] Testing AT command...
    Response: OK
    ✅ SIM900A is responding

[2] Checking signal strength (CSQ)...
    Response: +CSQ: 15,0
    ✅ Signal query successful
    ✅ Signal: 15 (good)

[3] Checking SIM card status...
    Response: +CPIN: READY
    ✅ SIM card is ready

[4] Checking network registration...
    Response: +CREG: 0,1
    ✅ Registered to network

[5] Checking network operator...
    Response: +COPS: 0,0,"SMART"
    ✅ Network operator detected

[6] SMS sending test skipped (no phone number provided)

======================================================================
✅ SMS test complete
======================================================================
```

### Step 3: Send Test SMS

If the connection test passes, send an actual SMS:

```bash
python3 test_sms_send.py +639123456789 "Test message from Bus Monitoring System"
```

Replace `+639123456789` with your actual phone number.

**Expected Output:**
```
[6] Sending test SMS...
    To: +639123456789
    Message: Test message from Bus Monitoring System

    Response: +CMGS: 123
    OK
    ✅ SMS sent successfully!
```

## Troubleshooting

### Issue: "Permission denied" or "Failed to open /dev/ttyUSB0"

**Solution:**
```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

### Issue: "No OK response"

**Possible causes:**
- SIM900A not powered (check LED)
- Wrong baudrate (try 115200 or 19200)
- Wrong port (try /dev/ttyACM0 instead of /dev/ttyUSB0)
- TX/RX reversed (swap connections)

**Debug steps:**
```bash
# Check if port exists
ls -la /dev/ttyUSB*

# Check USB adapter
lsusb

# Try different baudrate (edit script and change 9600 to 115200)
```

### Issue: "Signal: 0 (very weak or no signal)"

**Solution:**
- Move SIM900A to location with better signal
- Check antenna is properly connected
- Ensure SIM card has active service

### Issue: "SIM card requires PIN"

**Solution:**
- Remove PIN lock from SIM card using a phone
- Or unlock via AT command (not recommended for production)

### Issue: "Not registered to network"

**Possible causes:**
- No signal
- SIM card not activated
- Wrong SIM card type
- Network not available

**Solution:**
- Check SIM card works in a regular phone
- Wait for registration (can take 30-60 seconds after power-on)
- Check antenna

### Issue: "Failed to send SMS"

**Check:**
- Signal strength is > 10
- Network is registered
- Phone number format is correct (include country code: +63XXX)
- SMS balance is available on SIM card

## Alternative Test Scripts

### Quick SIM900A Check
```bash
python3 check_sim900.py
```

### Full Hardware Test (GPS + SIM900A)
```bash
python3 test_hardware.py
```

### GPIO4/GPIO5 Connection Test (if using direct GPIO)
```bash
# Start pigpio daemon first
sudo pigpiod

# Then run
python3 sim900a_gpio4_gpio5.py
```

## Integration with System

Once SMS is working, integrate with the main system:

1. **Edit `.env` file:**
   ```bash
   nano .env
   ```

2. **Set these values:**
   ```
   ENABLE_SMS=true
   SIM900A_PORT=/dev/ttyUSB0  # or /dev/ttyACM0
   SIM900A_BAUDRATE=9600
   EMERGENCY_CONTACTS=+639927268704,+639108945427
   ADMIN_CONTACTS=+639108945427
   ```

3. **Restart the main application:**
   ```bash
   sudo systemctl restart your-service-name
   ```

## Safety Notes

- ⚠️ Always disconnect power before wiring
- ⚠️ Use appropriate voltage (SIM900A typically needs 5V, not 3.3V)
- ⚠️ Ensure TX/RX are cross-connected (TX→RX, RX→TX)
- ⚠️ SIM900A can draw up to 2A during transmission - use adequate power supply
- ⚠️ Don't send spam SMS - respect carrier policies

## Next Steps

After successful SMS testing:
1. Test emergency button integration
2. Test transaction notifications
3. Test GPS + SMS combined alerts
4. Monitor SMS logs in database
