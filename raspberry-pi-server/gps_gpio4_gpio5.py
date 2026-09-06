#!/usr/bin/env python3
"""
GPS reader using RPi.GPIO bit-banging on GPIO4/5
"""

import RPi.GPIO as GPIO
import time

class GPS_RPiGPIO:
    """GPS using RPi.GPIO bit-banging on GPIO4 (RX)"""
    
    def __init__(self, rx_gpio=4, baudrate=9600):
        self.rx_gpio = rx_gpio
        self.baudrate = baudrate
        self.bit_time = 1.0 / baudrate
        
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.rx_gpio, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        
    def read_byte(self, timeout=0.1):
        """Read a single byte (bit-banging)"""
        # Wait for start bit
        start_time = time.time()
        while GPIO.input(self.rx_gpio) == GPIO.HIGH:
            if time.time() - start_time > timeout:
                return None
        
        # Wait for half bit time to center sampling
        time.sleep(self.bit_time * 0.5)
        
        # Read 8 data bits
        byte = 0
        for i in range(8):
            time.sleep(self.bit_time)
            if GPIO.input(self.rx_gpio) == GPIO.HIGH:
                byte |= (1 << i)
        
        # Wait for stop bit
        time.sleep(self.bit_time)
        
        return byte
    
    def read_nmea_sentence(self, timeout=2.0):
        """Read a complete NMEA sentence"""
        buffer = []
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            byte = self.read_byte(timeout=0.01)
            if byte is not None:
                char = chr(byte)
                buffer.append(char)
                
                # Check for end of sentence
                if char == '\n' and len(buffer) > 10:
                    sentence = ''.join(buffer)
                    if sentence.startswith('$'):
                        return sentence
                    buffer = []
        
        return None

# Test script
if __name__ == "__main__":
    print("Testing GPS on GPIO4 with RPi.GPIO bit-banging...")
    print("RX: GPIO4 (Pin 7)")
    print()
    
    gps = GPS_RPiGPIO(rx_gpio=4, baudrate=9600)
    
    print("Listening for GPS data (10 seconds)...")
    for i in range(10):
        sentence = gps.read_nmea_sentence(timeout=1.0)
        if sentence:
            print(f"Received: {sentence.strip()}")
        else:
            print(f"Sample {i+1}: No data")
    
    GPIO.cleanup()
    print("\nTest complete.")
