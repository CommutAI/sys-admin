import { useState, useEffect } from 'react';
import { Video, Users, AlertCircle, Wifi, WifiOff, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import { useBackendVideo } from '../hooks/useBackendVideo';

// Connection stages and their progress %
const CONNECTION_STAGES = {
  disconnected: { pct: 0,   label: 'Disconnected',        color: 'bg-red-500'    },
  connecting:   { pct: 20,  label: 'Connecting…',         color: 'bg-yellow-400' },
  connected:    { pct: 70, label: 'Starting stream…',    color: 'bg-blue-400'   },
  streaming:    { pct: 100, label: 'Streaming',            color: 'bg-green-500'  },
  error:        { pct: 20,  label: 'Reconnecting…',       color: 'bg-yellow-400' },
};

const VideoMonitoring = ({ autoConnect = true }) => {
  // Backend video streaming (YOLOv8n processed)
  const {
    isStreaming: backendStreaming,
    passengerCount: backendCount,
    connectionStatus: backendStatus,
    videoRef: backendVideoRef,
    refresh: backendRefresh,
  } = useBackendVideo({ autoConnect: autoConnect });

  // Use backend values
  const isStreaming = backendStreaming;
  const passengerCount = backendCount;
  const connectionStatus = backendStatus;
  const videoRef = backendVideoRef;
  const refresh = backendRefresh;

  // displayStage drives the progress bar — stream starts automatically inside the hook
  const displayStage = isStreaming
    ? 'streaming'
    : connectionStatus === 'connecting'
      ? 'connecting'
      : connectionStatus === 'connected'
      ? 'connected'
      : connectionStatus === 'error'
      ? 'error'
      : 'disconnected';

  const stage = CONNECTION_STAGES[displayStage] ?? CONNECTION_STAGES.disconnected;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bus Video Monitoring</h1>
          <p className="text-white/60 mt-1">
            Live video feed with AI passenger detection (Backend YOLOv8n)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="Reconnect"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Connection Progress Bar */}
      <div className="glass-card p-5 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {displayStage === 'streaming' ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : displayStage === 'connecting' || displayStage === 'connected' ? (
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            ) : displayStage === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className="text-white font-medium text-sm">{stage.label}</span>
          </div>
          <span className="text-white/40 text-xs">{stage.pct}%</span>
        </div>

        {/* Track */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-in-out ${stage.color}`}
            style={{ width: `${stage.pct}%` }}
          />
        </div>

        {/* Stage indicators */}
        <div className="flex justify-between text-xs text-white/30 px-0.5">
          <span className={displayStage !== 'disconnected' && displayStage !== 'error' ? 'text-white/60' : ''}>Disconnected</span>
          <span className={displayStage === 'connecting' || displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Connecting</span>
          <span className={displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Connected</span>
          <span className={displayStage === 'streaming' ? 'text-green-400 font-medium' : ''}>Streaming</span>
        </div>
      </div>

      {/* Full-width Video Feed */}
      <div className="glass-card rounded-xl overflow-hidden">
        {/* Relative container — 16:9 */}
        <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
          {/* Always-mounted img for WebSocket frames */}
          <img
            ref={videoRef}
            alt="Live video feed"
            className={`absolute inset-0 w-full h-full object-contain ${
              isStreaming ? 'block' : 'hidden'
            }`}
          />

          {/* Placeholder / connecting state */}
          {!isStreaming && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-6">
                {connectionStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-red-400 font-medium mb-1">Backend connection error</p>
                    <p className="text-white/40 text-sm mb-4">Make sure the backend server is running at localhost:8000</p>
                    <button
                      onClick={refresh}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm flex items-center gap-2 mx-auto transition-colors"
                    >
                      <RefreshCw size={14} />
                      Retry
                    </button>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto mb-4" />
                    <p className="text-white/60 text-lg">
                      {connectionStatus === 'connecting' ? 'Connecting to backend…' : 'Starting stream…'}
                    </p>
                    <p className="text-white/30 text-sm mt-1">Backend YOLOv8n processing</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* LIVE badge */}
          {isStreaming && (
            <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-sm font-semibold tracking-wide">LIVE</span>

            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-6 flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-7 h-7 text-orange-400" />
          </div>
          <div>
            <p className="text-white/60 text-sm">Current Passengers</p>
            <p className="text-white text-4xl font-bold leading-none mt-1">{passengerCount}</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isStreaming ? 'bg-green-500/20' : 'bg-white/10'
          }`}>
            <Video className={`w-7 h-7 ${isStreaming ? 'text-green-400' : 'text-white/40'}`} />
          </div>
          <div>
            <p className="text-white/60 text-sm">Stream</p>
            <p className={`text-xl font-bold leading-none mt-1 ${
              isStreaming ? 'text-green-400' : 'text-white/50'
            }`}>
              {isStreaming ? 'Active' : 'Inactive'}
            </p>
            <p className="text-white/30 text-xs mt-1">Backend YOLOv8n</p>
          </div>
        </div>
      </div>

      {/* Camera Info */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-3">Camera Info</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/50">Detection Model</p>
            <p className="text-white font-medium">YOLOv8n</p>
          </div>
          <div>
            <p className="text-white/50">Resolution</p>
            <p className="text-white font-medium">640x480</p>
          </div>
          <div>
            <p className="text-white/50">FPS</p>
            <p className="text-white font-medium">30</p>
          </div>
          <div>
            <p className="text-white/50">Detection</p>
            <p className="text-green-400 font-medium">YOLOv8n (Backend)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoMonitoring;
