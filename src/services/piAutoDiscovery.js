/**
 * Raspberry Pi Auto-Discovery Service
 * Automatically discovers and connects to Raspberry Pi on local network
 * Persists discovered IP in localStorage for seamless reconnection
 */

const STORAGE_KEY = 'raspberry_pi_discovered_ip';
const SMS_API_STORAGE_KEY = 'sms_api_discovered_ip';
const DISCOVERY_TIMEOUT = 2000; // Increased to 2 seconds for more reliable connection
const NETWORK_RANGES = [
  '192.168.1.', '192.168.0.', '192.168.100.', '192.168.50.',
  '10.0.0.', '10.0.1.', '172.16.0.', '192.168.88.',
  '192.168.2.', '192.168.10.' // Additional common ranges
];
const LOCALHOST_ADDRESSES = ['localhost', '127.0.0.1']; // Try localhost for local development

/**
 * Returns true when the app is served over HTTPS (i.e. production/Vercel).
 * Browsers block http:// and ws:// requests from https:// pages (Mixed Content),
 * so Pi discovery and direct connections must be skipped in this context.
 */
export function isSecureOrigin() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

/**
 * Get persisted IP from localStorage
 */
export function getPersistedIp() {
  try {
    const ip = localStorage.getItem(STORAGE_KEY);
    return ip || null;
  } catch (error) {
    console.warn('Failed to read persisted IP:', error);
    return null;
  }
}

/**
 * Get persisted SMS API IP from localStorage
 */
export function getPersistedSmsApiIp() {
  try {
    const ip = localStorage.getItem(SMS_API_STORAGE_KEY);
    return ip || null;
  } catch (error) {
    console.warn('Failed to read persisted SMS API IP:', error);
    return null;
  }
}

/**
 * Save discovered IP to localStorage
 */
export function persistIp(ip) {
  try {
    localStorage.setItem(STORAGE_KEY, ip);
  } catch (error) {
    console.warn('Failed to persist IP:', error);
  }
}

/**
 * Save discovered SMS API IP to localStorage
 */
export function persistSmsApiIp(ip) {
  try {
    localStorage.setItem(SMS_API_STORAGE_KEY, ip);
  } catch (error) {
    console.warn('Failed to persist SMS API IP:', error);
  }
}

/**
 * Clear persisted IP from localStorage
 */
export function clearPersistedIp() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear persisted IP:', error);
  }
}

/**
 * Force clear localhost from cache if it was incorrectly cached
 */
export function clearLocalhostCache() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && (cached === 'localhost' || cached === '127.0.0.1')) {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Failed to clear localhost cache:', error);
    return false;
  }
}

/**
 * Check if a specific IP is running the Raspberry Pi server
 */
async function checkRaspberryPi(ip) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

    const response = await fetch(`http://${ip}:8080/health`, {
      signal: controller.signal,
      mode: 'cors'
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Verify it's our Pi video server
      if (data.status === 'healthy' || data.service === 'commutai-pi-service') {
        return ip;
      }
    }
    return null;
  } catch (error) {
    return null; // Expected for most IPs that aren't our Pi
  }
}

/**
 * Check if a specific IP is running the SMS API server (integrated on port 8080)
 */
async function checkSmsApi(ip) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

    const response = await fetch(`http://${ip}:8080/health`, {
      signal: controller.signal,
      mode: 'cors'
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return ip;
    }
    return null;
  } catch (error) {
    return null; // Expected for most IPs that aren't our Pi
  }
}

/**
 * Discover Raspberry Pi on local network
 * Scans common network ranges to find the Raspberry Pi server
 */
export async function discoverRaspberryPi(onProgress = null) {
  // Skip local IP scanning on HTTPS unless a secure Pi URL (https://) is set.
  // Browsers block http:// fetch requests from https:// pages (Mixed Content).
  const piEnvUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_RASPBERRY_PI_URL : null;
  const secureUrl = piEnvUrl || 'https://hertz-osmosis-squiggly.ngrok-free.dev';
  if (isSecureOrigin() && (!secureUrl || !secureUrl.startsWith('https://'))) {
    console.log('[Pi Discovery] Skipping — running on HTTPS with no secure Pi URL configured');
    return null;
  }
  if (isSecureOrigin()) {
    // On HTTPS, don't scan local IPs — the ngrok URL handles remote access
    console.log('[Pi Discovery] Skipping local scan — using ngrok URL on HTTPS');
    return null;
  }

  if (onProgress) {
    onProgress({ type: 'info', message: 'Starting network scan...' });
  }

  try {
    // First, try the persisted IP if available
    const persistedIp = getPersistedIp();
    if (persistedIp) {
      if (onProgress) {
        onProgress({ type: 'info', message: `Trying persisted IP: ${persistedIp}...` });
      }
      
      const result = await checkRaspberryPi(persistedIp);
      if (result) {
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Connected to ${persistedIp} (cached)` });
        }
        return result;
      } else {
        if (onProgress) {
          onProgress({ type: 'warning', message: `Persisted IP ${persistedIp} not responding, scanning network...` });
        }
        clearPersistedIp(); // Clear invalid cached IP
      }
    }

    // Try localhost addresses first (for local development/testing)
    if (onProgress) {
      onProgress({ type: 'info', message: 'Checking localhost addresses...' });
    }
    
    for (const localAddr of LOCALHOST_ADDRESSES) {
      const result = await checkRaspberryPi(localAddr);
      if (result) {
        persistIp(result);
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Found Raspberry Pi at ${result} (localhost)` });
        }
        return result;
      }
    }

    // Scan a limited range of IPs (1-60 for each network to find Pi at .54)
    const ipPromises = [];
    
    for (const networkPrefix of NETWORK_RANGES) {
      for (let i = 1; i <= 60; i++) {
        const ip = networkPrefix + i;
        ipPromises.push(checkRaspberryPi(ip));
      }
    }

    if (onProgress) {
      onProgress({ type: 'info', message: `Scanning ${NETWORK_RANGES.length} network ranges (1-30)...` });
    }

    const results = await Promise.allSettled(ipPromises);
    
    // Find successful connections
    const foundIPs = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    if (foundIPs.length > 0) {
      const newIP = foundIPs[0];
      persistIp(newIP); // Save to localStorage
      
      if (onProgress) {
        onProgress({ type: 'success', message: `✓ Found Raspberry Pi at ${newIP}` });
      }
      
      return newIP;
    } else {
      if (onProgress) {
        onProgress({ type: 'error', message: '✗ No Raspberry Pi found on local network' });
      }
      return null;
    }
  } catch (error) {
    console.error('Discovery error:', error);
    if (onProgress) {
      onProgress({ type: 'error', message: `✗ Discovery failed: ${error.message}` });
    }
    return null;
  }
}

/**
 * Get Raspberry Pi URL with auto-discovery fallback
 * Returns the URL to use for API calls
 */
export async function getRaspberryPiUrl(forceDiscovery = false) {
  // Clear incorrectly cached localhost
  clearLocalhostCache();

  // If not forcing discovery, try persisted IP first
  if (!forceDiscovery) {
    const persistedIp = getPersistedIp();
    if (persistedIp) {
      // Quick check if persisted IP is still valid
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`http://${persistedIp}:8080/health`, {
          signal: controller.signal,
          mode: 'cors'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return `http://${persistedIp}:8080`;
        }
      } catch (error) {
        clearPersistedIp(); // Clear invalid cached IP
      }
    }
  }

  // Perform discovery
  const discoveredIp = await discoverRaspberryPi();
  if (discoveredIp) {
    return `http://${discoveredIp}:8080`;
  }

  // Fallback to known Pi LAN IP
  return 'http://192.168.1.54:8080';
}

/**
 * Discover SMS API on local network
 * Scans common network ranges to find the SMS API server
 */
export async function discoverSmsApi(onProgress = null) {
  if (onProgress) {
    onProgress({ type: 'info', message: 'Starting SMS API network scan...' });
  }

  try {
    // First, try the persisted IP if available
    const persistedIp = getPersistedSmsApiIp();
    if (persistedIp) {
      if (onProgress) {
        onProgress({ type: 'info', message: `Trying persisted SMS API IP: ${persistedIp}...` });
      }

      const result = await checkSmsApi(persistedIp);
      if (result) {
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Connected to SMS API at ${result} (cached)` });
        }
        return result;
      } else {
        if (onProgress) {
          onProgress({ type: 'warning', message: `Persisted SMS API IP ${persistedIp} not responding, scanning network...` });
        }
        clearPersistedSmsApiIp(); // Clear invalid cached IP
      }
    }

    // Try localhost addresses first (for local development/testing)
    if (onProgress) {
      onProgress({ type: 'info', message: 'Checking localhost addresses for SMS API...' });
    }

    for (const localAddr of LOCALHOST_ADDRESSES) {
      const result = await checkSmsApi(localAddr);
      if (result) {
        persistSmsApiIp(result);
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Found SMS API at ${result} (localhost)` });
        }
        return result;
      }
    }

    // Scan a limited range of IPs (1-30 for each network to avoid long scans)
    const ipPromises = [];

    for (const networkPrefix of NETWORK_RANGES) {
      for (let i = 1; i <= 30; i++) {
        const ip = networkPrefix + i;
        ipPromises.push(checkSmsApi(ip));
      }
    }

    if (onProgress) {
      onProgress({ type: 'info', message: `Scanning ${NETWORK_RANGES.length} network ranges (1-30) for SMS API...` });
    }

    const results = await Promise.allSettled(ipPromises);

    // Find successful connections
    const foundIPs = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    if (foundIPs.length > 0) {
      const newIP = foundIPs[0];
      persistSmsApiIp(newIP); // Save to localStorage

      if (onProgress) {
        onProgress({ type: 'success', message: `✓ Found SMS API at ${newIP}` });
      }

      return newIP;
    } else {
      if (onProgress) {
        onProgress({ type: 'error', message: '✗ No SMS API found on local network' });
      }
      return null;
    }
  } catch (error) {
    console.error('SMS API discovery error:', error);
    if (onProgress) {
      onProgress({ type: 'error', message: `✗ SMS API discovery failed: ${error.message}` });
    }
    return null;
  }
}

/**
 * Clear persisted SMS API IP from localStorage
 */
export function clearPersistedSmsApiIp() {
  try {
    localStorage.removeItem(SMS_API_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear persisted SMS API IP:', error);
  }
}

/**
 * Get SMS API URL with auto-discovery fallback
 * Returns the URL to use for SMS API calls
 */
export async function getSmsApiUrl(forceDiscovery = false) {
  // If not forcing discovery, try persisted IP first
  if (!forceDiscovery) {
    const persistedIp = getPersistedSmsApiIp();
    if (persistedIp) {
      // Quick check if persisted IP is still valid
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`http://${persistedIp}:8080/health`, {
          signal: controller.signal,
          mode: 'cors'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return `http://${persistedIp}:8080`;
        }
      } catch (error) {
        clearPersistedSmsApiIp(); // Clear invalid cached IP
      }
    }
  }

  // Perform discovery
  const discoveredIp = await discoverSmsApi();
  if (discoveredIp) {
    return `http://${discoveredIp}:8080`;
  }

  return 'http://192.168.1.54:8080';
}
