import { useState, useEffect, useRef } from 'react';
import { Video, Users, AlertCircle, Wifi, WifiOff, Play, Square, RefreshCw } from 'lucide-react';
import io from 'socket.io-client';

const VideoMonitoring = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [passengerCount, setPassengerCount] = useState(0);
  const [averageCount, setAverageCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [serverUrl, setServerUrl] = useState('http://localhost:5000');
  
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    connectToServer();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  const connectToServer = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('Connected to video server');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      setIsStreaming(false);
      console.log('Disconnected from video server');
    });

    socketRef.current.on('video_frame', (data) => {
      if (data.frame && videoRef.current) {
        videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
        setIsStreaming(true);
      }
    });

    socketRef.current.on('passenger_count', (data) => {
      setPassengerCount(data.count);
      setAverageCount(data.average_count.toFixed(1));
      setLastUpdate(new Date().toLocaleTimeString());
    });

    socketRef.current.on('status', (data) => {
      console.log('Server status:', data.message);
    });

    socketRef.current.on('error', (data) => {
      setError(data.message);
      console.error('Server error:', data.message);
    });

    socketRef.current.on('connect_error', (error) => {
      setIsConnected(false);
      setError('Failed to connect to video server');
      console.error('Connection error:', error);
    });
  };

  const startStream = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('start_stream');
    }
  };

  const stopStream = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('stop_stream');
      setIsStreaming(false);
    }
  };

  const refreshConnection = () => {
    setIsConnected(false);
    setIsStreaming(false);
    setError(null);
    setTimeout(() => connectToServer(), 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bus Video Monitoring</h1>
          <p className="text-white/60 mt-1">Live video feed with AI passenger detection</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="Server URL (e.g., http://192.168.1.100:5000)"
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-orange-500 w-80"
          />
          <button
            onClick={refreshConnection}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="Refresh Connection"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className={`glass-card p-4 rounded-xl flex items-center gap-3 ${
        isConnected ? 'border-green-500/30' : 'border-red-500/30'
      }`}>
        {isConnected ? (
          <Wifi className="w-5 h-5 text-green-400" />
        ) : (
          <WifiOff className="w-5 h-5 text-red-400" />
        )}
        <div className="flex-1">
          <p className="text-white font-medium">
            {isConnected ? 'Connected to Video Server' : 'Disconnected from Video Server'}
          </p>
          <p className="text-white/60 text-sm">{serverUrl}</p>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Feed */}
        <div className="lg:col-span-2">
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-orange-400" />
                <h2 className="text-white font-semibold">Live Video Feed</h2>
              </div>
              <div className="flex items-center gap-2">
                {!isStreaming && isConnected && (
                  <button
                    onClick={startStream}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Play size={16} />
                    Start Stream
                  </button>
                )}
                {isStreaming && (
                  <button
                    onClick={stopStream}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Square size={16} />
                    Stop Stream
                  </button>
                )}
              </div>
            </div>
            <div className="aspect-video bg-black/50 relative">
              {isStreaming ? (
                <img
                  ref={videoRef}
                  alt="Live video feed"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Video className="w-16 h-16 text-white/30 mx-auto mb-4" />
                    <p className="text-white/50">
                      {isConnected ? 'Click "Start Stream" to begin' : 'Connect to server to start streaming'}
                    </p>
                  </div>
                </div>
              )}
              {/* Overlay Info */}
              {isStreaming && (
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-white text-sm font-medium">LIVE</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Passenger Count Panel */}
        <div className="space-y-6">
          {/* Current Count */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-orange-400" />
              <h2 className="text-white font-semibold">Passenger Count</h2>
            </div>
            <div className="text-center py-8">
              <div className="text-6xl font-bold text-white mb-2">{passengerCount}</div>
              <p className="text-white/60">Current Passengers</p>
            </div>
            {lastUpdate && (
              <div className="text-center text-white/40 text-sm">
                Last updated: {lastUpdate}
              </div>
            )}
          </div>

          {/* Statistics */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Statistics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-white/60">Average (30 frames)</span>
                <span className="text-white font-medium">{averageCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">Stream Status</span>
                <span className={`font-medium ${isStreaming ? 'text-green-400' : 'text-red-400'}`}>
                  {isStreaming ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">Connection</span>
                <span className={`font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* Camera Info */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Camera Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Model</span>
                <span className="text-white">EMEET C60E</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Resolution</span>
                <span className="text-white">1280x720</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">FPS</span>
                <span className="text-white">15</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">AI Model</span>
                <span className="text-white">YOLOv8n</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">Setup Instructions</h3>
        <div className="space-y-4 text-white/70">
          <div>
            <p className="font-medium text-white mb-2">1. Raspberry Pi Setup</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Install dependencies: <code className="bg-white/10 px-2 py-1 rounded">pip install -r requirements.txt</code></li>
              <li>Download YOLOv8n model to the server directory</li>
              <li>Run server: <code className="bg-white/10 px-2 py-1 rounded">python video_server.py</code></li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-white mb-2">2. Connect Camera</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Connect EMEET C60E webcam to Raspberry Pi USB port</li>
              <li>Ensure camera is recognized: <code className="bg-white/10 px-2 py-1 rounded">ls /dev/video*</code></li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-white mb-2">3. Connect Web Interface</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Enter Raspberry Pi IP address above (e.g., http://192.168.1.100:5000)</li>
              <li>Click "Start Stream" to begin video feed</li>
              <li>AI detection will automatically count passengers</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoMonitoring;
