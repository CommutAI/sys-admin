#!/bin/bash
# Quick UART device detection script

echo "============================================================"
echo "🔧 UART Hardware Detection for GPS and SIM900A"
echo "============================================================"
echo ""

# List all serial ports
echo "📡 Available serial ports:"
echo ""

if ls /dev/ttyUSB* 2>/dev/null; then
    echo ""
else
    echo "❌ No /dev/ttyUSB* devices found"
fi

if ls /dev/ttyACM* 2>/dev/null; then
    echo ""
else
    echo "❌ No /dev/ttyACM* devices found"
fi

if ls /dev/ttyS* 2>/dev/null; then
    echo ""
else
    echo "❌ No /dev/ttyS* devices found"
fi

echo ""
echo "============================================================"
echo "💡 Tips:"
echo "  - USB-TTL adapters typically appear as /dev/ttyUSB0, /dev/ttyUSB1"
echo "  - Arduino/FTDI adapters may appear as /dev/ttyACM0"
echo "  - Built-in UART appears as /dev/ttyS0, /dev/ttyS1"
echo "  - Make sure devices are powered (check LEDs)"
echo "============================================================"
