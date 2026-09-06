#!/usr/bin/env python3
"""
Simple GPIO test to verify SIM900A is connected to GPIO4/5
"""

import RPi.GPIO as GPIO
import time

def test_gpio_pins():
    """Test if SIM900A is responding on GPIO4/5"""
    GPIO.setmode(GPIO.BCM)
    
    # Setup GPIO5 as output (TX)
    GPIO.setup(5, GPIO.OUT)
    GPIO.output(5, GPIO.HIGH)
    
    # Setup GPIO4 as input (RX)
    GPIO.setup(4, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    
    print("Testing GPIO4/5 connection to SIM900A...")
    print("TX: GPIO5 (Pin 29)")
    print("RX: GPIO4 (Pin 7)")
    print()
    
    # Test 1: Check if RX is receiving data
    print("Test 1: Checking if RX (GPIO4) is receiving data...")
    print("Send AT command from another terminal or check if SIM900A is transmitting")
    print("Current RX state:", "HIGH" if GPIO.input(4) == GPIO.HIGH else "LOW")
    
    # Test 2: Toggle TX and check if RX responds
    print("\nTest 2: Toggling TX (GPIO5) and checking RX response...")
    for i in range(5):
        GPIO.output(5, GPIO.LOW)
        time.sleep(0.1)
        rx_state = GPIO.input(4)
        print(f"  TX LOW, RX: {'HIGH' if rx_state == GPIO.HIGH else 'LOW'}")
        
        GPIO.output(5, GPIO.HIGH)
        time.sleep(0.1)
        rx_state = GPIO.input(4)
        print(f"  TX HIGH, RX: {'HIGH' if rx_state == GPIO.HIGH else 'LOW'}")
    
    # Test 3: Check if SIM900A is powered on
    print("\nTest 3: Checking SIM900A power status...")
    print("If SIM900A is powered on, it should be transmitting data periodically")
    print("Monitor RX (GPIO4) for activity...")
    
    for i in range(10):
        rx_state = GPIO.input(4)
        print(f"  Sample {i+1}: RX = {'HIGH' if rx_state == GPIO.HIGH else 'LOW'}")
        time.sleep(0.5)
    
    GPIO.cleanup()
    print("\nTest complete.")
    print("\nIf RX stays HIGH constantly, SIM900A may not be connected or not powered on.")
    print("If RX toggles, SIM900A is transmitting data.")

if __name__ == "__main__":
    test_gpio_pins()
