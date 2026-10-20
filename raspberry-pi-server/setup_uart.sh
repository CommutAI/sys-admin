#!/bin/bash
# Setup UART for GPS on GPIO pins 8 & 10 and check SIM900 USB adapter

echo "============================================================"
echo "🔧 UART Setup for GPS and SIM900A"
echo "============================================================"
echo ""

# Check if raspi-config is available
if command -v raspi-config &> /dev/null; then
    echo "✅ raspi-config found"
else
    echo "❌ raspi-config not found - you may not be on a Raspberry Pi"
    echo "   Continuing with manual checks..."
fi

echo ""
echo "📡 Checking serial devices..."
echo ""

# List USB serial devices (SIM900 USB-TTL adapter)
echo "USB Serial Devices (SIM900):"
if ls /dev/ttyUSB* 2>/dev/null; then
    echo "   ✅ Found USB serial device(s)"
else
    echo "   ❌ No /dev/ttyUSB* devices found"
    echo "   Make sure SIM900 USB-TTL adapter is connected"
fi

if ls /dev/ttyACM* 2>/dev/null; then
    echo "   ✅ Found ACM serial device(s)"
else
    echo "   ℹ️  No /dev/ttyACM* devices"
fi

echo ""
echo "Built-in UART Devices (GPS on GPIO 8 & 10):"
if [ -e /dev/ttyS0 ]; then
    echo "   ✅ /dev/ttyS0 exists (UART0)"
else
    echo "   ❌ /dev/ttyS0 not found"
fi

if [ -e /dev/ttyAMA0 ]; then
    echo "   ✅ /dev/ttyAMA0 exists (main UART)"
else
    echo "   ℹ️  /dev/ttyAMA0 not found"
fi

if [ -e /dev/serial0 ]; then
    echo "   ✅ /dev/serial0 exists (symlink to UART0)"
else
    echo "   ℹ️  /dev/serial0 not found"
fi

echo ""
echo "============================================================"
echo "🔍 Checking /boot/config.txt for UART settings..."
echo ""

if [ -f /boot/config.txt ]; then
    if grep -q "enable_uart=1" /boot/config.txt; then
        echo "✅ UART is enabled in config.txt"
    else
        echo "❌ UART may be disabled in config.txt"
        echo "   Add 'enable_uart=1' to /boot/config.txt and reboot"
    fi

    if grep -q "dtoverlay=pi3-miniuart-bt" /boot/config.txt; then
        echo "✅ Mini UART is configured (Bluetooth moved)"
    else
        echo "ℹ️  Standard UART configuration"
    fi
else
    echo "⚠️  /boot/config.txt not found (not on Pi?)"
fi

echo ""
echo "============================================================"
echo "🔍 Checking cmdline.txt for serial console..."
echo ""

if [ -f /boot/cmdline.txt ]; then
    if grep -q "console=serial0" /boot/cmdline.txt; then
        echo "⚠️  Serial console is enabled - may interfere with GPS"
        echo "   Remove 'console=serial0,115200' from /boot/cmdline.txt"
    else
        echo "✅ Serial console is disabled - good for GPS"
    fi
else
    echo "⚠️  /boot/cmdline.txt not found"
fi

echo ""
echo "============================================================"
echo "💡 Summary:"
echo "============================================================"
echo ""
echo "GPS (NEO-6M) on GPIO 8 & 10:"
echo "  - Should use: /dev/ttyS0 or /dev/serial0"
echo "  - UART must be enabled in /boot/config.txt"
echo "  - Serial console should be disabled"
echo ""
echo "SIM900A (USB-TTL adapter):"
echo "  - Should use: /dev/ttyUSB0 or /dev/ttyACM0"
echo "  - Check: lsusb to see connected USB devices"
echo ""
echo "To enable UART if needed:"
echo "  sudo raspi-config"
echo "  → Interface Options → Serial Port"
echo "  → Enable serial, disable serial console"
echo "  → Reboot"
echo ""
echo "============================================================"
