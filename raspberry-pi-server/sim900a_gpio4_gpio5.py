#!/usr/bin/env python3
"""
SIM900A connection using GPIO4/GPIO5 with software serial
Install: pip install pigpio
"""

import pigpio
import time

class SIM900A_GPIO:
    """SIM900A using GPIO4 (RX) and GPIO5 (TX) with pigpio software serial"""
    
    def __init__(self, rx_gpio=4, tx_gpio=5, baudrate=9600):
        self.rx_gpio = rx_gpio
        self.tx_gpio = tx_gpio
        self.baudrate = baudrate
        self.pi = None
        self.serial_handle = None
        self.connected = False
        
    def connect(self) -> bool:
        """Connect to SIM900A using pigpio software serial"""
        try:
            # Initialize pigpio
            self.pi = pigpio.pi()
            if not self.pi.connected:
                print("Failed to connect to pigpio daemon")
                return False
            
            # Open software serial
            self.serial_handle = self.pi.serial_open(
                self.rx_gpio,
                self.tx_gpio,
                self.baudrate
            )
            
            if self.serial_handle < 0:
                print("Failed to open software serial")
                return False
            
            # Test connection
            self.send_command('AT')
            response = self.read_response()
            
            if 'OK' in response:
                self.connected = True
                print("SIM900A connected successfully via GPIO4/GPIO5")
                return True
            else:
                print(f"SIM900A connection failed. Response: {response}")
                return False
                
        except Exception as e:
            print(f"SIM900A connection error: {e}")
            return False
    
    def send_command(self, command: str):
        """Send AT command"""
        if not self.connected:
            return
        
        command_bytes = (command + '\r').encode()
        self.pi.serial_write(self.serial_handle, command_bytes)
        time.sleep(0.5)
    
    def read_response(self, timeout: float = 2.0) -> str:
        """Read response from SIM900A"""
        if not self.connected:
            return ""
        
        response = b""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            count = self.pi.serial_read_available(self.serial_handle)
            if count > 0:
                data, _ = self.pi.serial_read(self.serial_handle, count)
                response += data
            time.sleep(0.1)
        
        return response.decode('ascii', errors='ignore')
    
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
            
            # Send message (Ctrl+Z = \x1A)
            self.send_command(f'{message}\x1A')
            time.sleep(3)
            
            response = self.read_response()
            
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
        """Disconnect from SIM900A"""
        if self.serial_handle is not None:
            self.pi.serial_close(self.serial_handle)
            self.serial_handle = None
        if self.pi:
            self.pi.stop()
            self.pi = None
        self.connected = False
        print("SIM900A disconnected")


# Test script
if __name__ == "__main__":
    # Start pigpio daemon first:
    # sudo pigpiod
    
    sim900a = SIM900A_GPIO(rx_gpio=4, tx_gpio=5, baudrate=9600)
    
    if sim900a.connect():
        print("Connection successful!")
        
        # Check SIM card
        sim900a.send_command('AT+CPIN?')
        print(f"SIM Status: {sim900a.read_response()}")
        
        # Check signal
        sim900a.send_command('AT+CSQ')
        print(f"Signal: {sim900a.read_response()}")
        
        # Send test SMS (replace with your number)
        # sim900a.send_sms('+639123456789', 'Test from GPIO4/GPIO5')
        
        sim900a.disconnect()
    else:
        print("Connection failed")
