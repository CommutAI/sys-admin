#!/usr/bin/env python3
"""
SIM900A using RPi.GPIO bit-banging software serial
Works on GPIO4 (RX) and GPIO5 (TX) without pigpio
"""

import RPi.GPIO as GPIO
import time

class SIM900A_RPiGPIO:
    """SIM900A using RPi.GPIO bit-banging on GPIO4/5"""
    
    def __init__(self, tx_gpio=5, rx_gpio=4, baudrate=9600):
        self.tx_gpio = tx_gpio
        self.rx_gpio = rx_gpio
        self.baudrate = baudrate
        self.bit_time = 1.0 / baudrate
        self.connected = False
        
        # Setup GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.tx_gpio, GPIO.OUT)
        GPIO.setup(self.rx_gpio, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.output(self.tx_gpio, GPIO.HIGH)  # Idle state
        
    def connect(self) -> bool:
        """Test connection with AT command"""
        try:
            response = self.send_command('AT', timeout=1.0)
            if 'OK' in response:
                self.connected = True
                print("SIM900A connected successfully via GPIO4/5")
                return True
            else:
                print(f"SIM900A connection failed. Response: {response}")
                return False
        except Exception as e:
            print(f"SIM900A connection error: {e}")
            return False
    
    def send_byte(self, byte):
        """Send a single byte (bit-banging)"""
        # Start bit
        GPIO.output(self.tx_gpio, GPIO.LOW)
        time.sleep(self.bit_time)
        
        # 8 data bits (LSB first)
        for i in range(8):
            bit = (byte >> i) & 0x01
            GPIO.output(self.tx_gpio, GPIO.HIGH if bit else GPIO.LOW)
            time.sleep(self.bit_time)
        
        # Stop bit
        GPIO.output(self.tx_gpio, GPIO.HIGH)
        time.sleep(self.bit_time)
    
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
    
    def send_command(self, command: str, timeout: float = 1.0) -> str:
        """Send AT command and read response"""
        if not self.connected and command != 'AT':
            return ""
        
        # Send command
        for char in command:
            self.send_byte(ord(char))
        self.send_byte(ord('\r'))
        
        # Read response
        response = ""
        start_time = time.time()
        buffer = []
        
        while time.time() - start_time < timeout:
            byte = self.read_byte(timeout=0.01)
            if byte is not None:
                if byte == 13:  # CR
                    continue
                elif byte == 10:  # LF
                    if buffer:
                        response = ''.join([chr(b) for b in buffer])
                        if 'OK' in response or 'ERROR' in response:
                            break
                        buffer = []
                else:
                    buffer.append(byte)
        
        return response
    
    def send_sms(self, phone_number: str, message: str) -> bool:
        """Send SMS"""
        if not self.connected:
            print("SIM900A not connected")
            return False
        
        try:
            # Set SMS mode to text
            self.send_command('AT+CMGF=1')
            time.sleep(0.5)
            
            # Set recipient
            self.send_command(f'AT+CMGS="{phone_number}"')
            time.sleep(0.5)
            
            # Send message (Ctrl+Z = 0x1A)
            for char in message:
                self.send_byte(ord(char))
            self.send_byte(0x1A)
            time.sleep(3)
            
            response = self.send_command('AT', timeout=0.5)
            
            if 'OK' in response:
                print(f"SMS sent to {phone_number}")
                return True
            else:
                print(f"Failed to send SMS. Response: {response}")
                return False
                
        except Exception as e:
            print(f"SMS sending error: {e}")
            return False
    
    def disconnect(self):
        """Cleanup GPIO"""
        GPIO.cleanup()
        self.connected = False
        print("SIM900A disconnected")


# Test script
if __name__ == "__main__":
    print("Testing SIM900A on GPIO4/5 with RPi.GPIO bit-banging...")
    
    sim900a = SIM900A_RPiGPIO(tx_gpio=5, rx_gpio=4, baudrate=9600)
    
    if sim900a.connect():
        print("✓ Connection successful!")
        
        # Check SIM card
        print("Checking SIM card...")
        response = sim900a.send_command('AT+CPIN?', timeout=2.0)
        print(f"SIM Status: {response}")
        
        # Check signal
        print("Checking signal...")
        response = sim900a.send_command('AT+CSQ', timeout=2.0)
        print(f"Signal: {response}")
        
        # Send test SMS (uncomment and add your number)
        # print("Sending test SMS...")
        # sim900a.send_sms('+639123456789', 'Test from RPi.GPIO GPIO4/5')
        
        sim900a.disconnect()
    else:
        print("✗ Connection failed")
