"""
Video Processing Router
WebSocket endpoint to receive raw video frames from Raspberry Pi
Processes frames with YOLOv8 and streams results back
"""

import asyncio
import json
import base64
import httpx
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from typing import Dict, Set
import cv2
import numpy as np
import os
from dotenv import load_dotenv
from fastapi.responses import JSONResponse

from video_processor import video_processor
from database import supabase

load_dotenv()

router = APIRouter()

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.pi_connections: Set[WebSocket] = set()
        self.frontend_connections: Set[WebSocket] = set()
        self.frontend_in_flight: Set[WebSocket] = set()
        self.latest_frame: str = None  # Store latest processed frame for new clients

    async def connect_pi(self, websocket: WebSocket, client_id: str):
        """Connect a Raspberry Pi client"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.pi_connections.add(websocket)
        print(f"[Video Router] Pi connected: {client_id}")

    async def connect_frontend(self, websocket: WebSocket):
        """Connect a frontend client"""
        await websocket.accept()
        self.frontend_connections.add(websocket)
        print(f"[Video Router] Frontend connected")

        # Send latest frame if available
        if self.latest_frame:
            try:
                await websocket.send_json({
                    'type': 'video_frame',
                    'frame': self.latest_frame,
                    'count': getattr(video_processor, 'last_passenger_count', 0),
                    'trip_id': getattr(video_processor, 'current_trip_id', None)
                })
            except:
                pass

    def disconnect_pi(self, websocket: WebSocket, client_id: str):
        """Disconnect a Raspberry Pi client"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if websocket in self.pi_connections:
            self.pi_connections.remove(websocket)
        print(f"[Video Router] Pi disconnected: {client_id}")

    def disconnect_frontend(self, websocket: WebSocket):
        """Disconnect a frontend client"""
        if websocket in self.frontend_connections:
            self.frontend_connections.remove(websocket)
        self.frontend_in_flight.discard(websocket)
        print(f"[Video Router] Frontend disconnected")

    async def broadcast_to_frontends(self, message: dict):
        """Broadcast to frontend clients with backpressure protection (drops stale frames on slow networks)"""
        if not self.frontend_connections:
            return
        payload = json.dumps(message)
        
        async def _send_one(conn):
            try:
                await asyncio.wait_for(conn.send_text(payload), timeout=0.30)
            except Exception:
                self.frontend_connections.discard(conn)
            finally:
                self.frontend_in_flight.discard(conn)

        for connection in list(self.frontend_connections):
            if connection in self.frontend_in_flight:
                # Client connection still transmitting previous frame: skip to prevent buffering
                continue
            self.frontend_in_flight.add(connection)
            asyncio.create_task(_send_one(connection))

manager = ConnectionManager()

# ── Remote command queue ──────────────────────────────────────────────────────
# Commands posted via POST /api/pi/command are queued here and flushed to the
# Pi on its next WebSocket message (ping or frame).  Results come back as
# type='command_result' and are stored so the HTTP caller can poll for them.

import asyncio
from collections import deque

_command_queue: deque = deque()          # pending {id, command} dicts
_command_results: dict = {}              # id → result dict (last 50 kept)
_MAX_RESULTS = 50


def _enqueue_command(cmd_id: str, command: str):
    _command_queue.append({"id": cmd_id, "command": command})


async def _flush_commands_to_pi(websocket: WebSocket):
    """Send any queued commands down the Pi WebSocket connection."""
    while _command_queue:
        cmd = _command_queue.popleft()
        try:
            await websocket.send_json({"type": "remote_command", **cmd})
            print(f"[RemoteCmd] Sent command {cmd['id']} to Pi: {cmd['command']}")
        except Exception as e:
            print(f"[RemoteCmd] Failed to send command {cmd['id']}: {e}")
            _command_queue.appendleft(cmd)   # put it back
            break


@router.post("/api/pi/command")
async def send_pi_command(payload: dict):
    """
    Queue a whitelisted shell command to be executed on the Pi.
    The Pi will run it on its next WebSocket heartbeat and return the result.

    Body: { "command": "pip install --upgrade supabase postgrest-py" }
    Returns: { "id": "<uuid>", "status": "queued" }
    """
    import uuid
    command = (payload.get("command") or "").strip()
    if not command:
        raise HTTPException(status_code=400, detail="command is required")

    # Whitelist — only allow safe upgrade/status commands
    ALLOWED_PREFIXES = (
        "pip install",
        "pip show",
        "python --version",
        "python3 --version",
        "sudo systemctl restart",
        "sudo systemctl status",
        "sudo systemctl stop",
        "sudo systemctl start",
        "sudo reboot",
        "echo ",
        "ls ",
        "cat /proc/version",
    )
    if not any(command.startswith(p) for p in ALLOWED_PREFIXES):
        raise HTTPException(
            status_code=403,
            detail=f"Command not in whitelist. Allowed prefixes: {list(ALLOWED_PREFIXES)}"
        )

    cmd_id = str(uuid.uuid4())[:8]
    _enqueue_command(cmd_id, command)
    if not manager.pi_connections:
        return {"id": cmd_id, "status": "queued_no_pi", "note": "Pi is not connected — command will execute when Pi reconnects"}
    return {"id": cmd_id, "status": "queued"}


@router.get("/api/pi/command/{cmd_id}")
async def get_pi_command_result(cmd_id: str):
    """Poll for the result of a previously queued command."""
    if cmd_id in _command_results:
        return _command_results[cmd_id]
    # Check if still pending
    pending = [c for c in _command_queue if c["id"] == cmd_id]
    if pending:
        return {"id": cmd_id, "status": "pending"}
    return {"id": cmd_id, "status": "unknown"}


@router.get("/api/pi/status")
async def get_pi_connection_status():
    """Check whether the Pi is currently connected via WebSocket."""
    return {
        "pi_connected": len(manager.pi_connections) > 0,
        "pi_count": len(manager.pi_connections),
        "frontend_count": len(manager.frontend_connections),
        "pending_commands": len(_command_queue),
    }


@router.post("/api/pi/trigger-upload")
async def trigger_pi_upload():
    """
    Tell the Pi to immediately scan for and upload any local recordings to Supabase Storage.
    The Pi handles this on its next WebSocket heartbeat.
    Safe to call even when Pi is offline — it will execute on reconnect.
    """
    import uuid
    cmd_id = str(uuid.uuid4())[:8]
    _enqueue_command(cmd_id, "__trigger_upload__")
    if not manager.pi_connections:
        return {
            "id": cmd_id,
            "status": "queued_no_pi",
            "note": "Pi is offline — upload will start automatically when Pi reconnects"
        }
    return {"id": cmd_id, "status": "queued", "note": "Upload trigger sent to Pi"}


@router.websocket("/ws/video-stream/{client_id}")
async def video_stream_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint to receive raw video frames from Raspberry Pi
    and return processed detection results
    """
    await manager.connect_pi(websocket, client_id)

    try:
        while True:
            # Receive frame data from Pi
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                # Handle different message types
                if message.get('type') == 'frame':
                    # Flush any queued remote commands opportunistically
                    if _command_queue:
                        await _flush_commands_to_pi(websocket)

                    # Process video frame
                    frame_data = message.get('frame')
                    if not frame_data:
                        continue

                    # Extract GPS data if available
                    gps_data = message.get('gps')
                    trip_id = message.get('trip_id')

                    # Set trip ID if provided
                    if trip_id:
                        video_processor.set_current_trip(trip_id)

                    # Save GPS location to database if available (now works without trip_id)
                    if gps_data:
                        video_processor.save_gps_to_db(gps_data, trip_id)

                    # Decode frame
                    frame = video_processor.decode_frame(frame_data)
                    if frame is None:
                        continue

                    # Start recording if not started and trip is active
                    if video_processor.current_trip_id and video_processor.video_writer is None:
                        height, width = frame.shape[:2]
                        video_processor.start_recording(width, height)

                    # Detect passengers (async for Roboflow support)
                    detections = await video_processor.detect_passengers(frame)
                    passenger_count = len(detections)
                    video_processor.last_passenger_count = passenger_count
                    active_trip = trip_id or video_processor.get_or_fetch_active_trip()

                    # Draw detection boxes on frame
                    frame_with_boxes = video_processor.draw_detections(frame, detections)

                    # Write frame to recording if recording is active
                    if video_processor.video_writer is not None:
                        video_processor.write_frame_to_recording(frame_with_boxes)

                    # Encode frame — low quality to save memory and bandwidth
                    _, buffer = cv2.imencode('.jpg', frame_with_boxes, [cv2.IMWRITE_JPEG_QUALITY, 30])
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')

                    # Explicitly release large objects to help GC
                    del frame, frame_with_boxes, buffer

                    # Store latest frame for new frontend clients
                    manager.latest_frame = frame_base64

                    # Save to database if trip is active
                    video_processor.save_passenger_count_to_db(passenger_count)

                    # Send detection results back to Pi
                    response = {
                        'type': 'detection',
                        'count': passenger_count,
                        'trip_id': active_trip,
                        'detections': detections,
                        'timestamp': message.get('timestamp')
                    }
                    await websocket.send_json(response)

                    # Broadcast processed frame to frontend clients
                    await manager.broadcast_to_frontends({
                        'type': 'video_frame',
                        'frame': frame_base64,
                        'count': passenger_count,
                        'trip_id': active_trip,
                        'timestamp': message.get('timestamp')
                    })

                elif message.get('type') == 'gps_update':
                    # Handle standalone GPS update (works without camera)
                    gps_data = message.get('gps')
                    trip_id = message.get('trip_id')

                    # Set trip ID if provided
                    if trip_id:
                        video_processor.set_current_trip(trip_id)

                    # Save GPS location to database if available (now works without trip_id)
                    if gps_data:
                        video_processor.save_gps_to_db(gps_data, trip_id)
                        print(f"[Backend] GPS update received (trip_id: {trip_id}): {gps_data['latitude']:.6f}, {gps_data['longitude']:.6f}")
                    else:
                        print(f"[Backend] GPS update received but no gps_data")

                elif message.get('type') == 'set_trip':
                    # Set current trip ID
                    trip_id = message.get('trip_id')
                    if trip_id:
                        video_processor.set_current_trip(trip_id)
                        await websocket.send_json({'type': 'trip_set', 'trip_id': trip_id})

                elif message.get('type') == 'start_recording':
                    # Start video recording for current trip
                    trip_id = message.get('trip_id')
                    frame_data = message.get('frame')
                    if trip_id and frame_data:
                        video_processor.set_current_trip(trip_id)
                        frame = video_processor.decode_frame(frame_data)
                        if frame:
                            height, width = frame.shape[:2]
                            success = video_processor.start_recording(width, height)
                            await websocket.send_json({
                                'type': 'recording_started',
                                'success': success
                            })
                    else:
                        await websocket.send_json({
                            'type': 'recording_started',
                            'success': False,
                            'error': 'Missing trip_id or frame'
                        })

                elif message.get('type') == 'stop_recording':
                    # Stop video recording
                    video_info = video_processor.stop_recording()
                    response = {'type': 'recording_stopped'}
                    if video_info:
                        response['video_info'] = video_info
                    await websocket.send_json(response)

                elif message.get('type') == 'clear_trip':
                    # Clear current trip ID and stop recording
                    video_info = video_processor.stop_recording()
                    video_processor.clear_current_trip()

                    response = {'type': 'trip_cleared'}
                    if video_info:
                        response['video_info'] = video_info

                    await websocket.send_json(response)
                
                elif message.get('type') == 'ping':
                    # Keep-alive ping — also flush any pending remote commands
                    await _flush_commands_to_pi(websocket)
                    await websocket.send_json({'type': 'pong'})

                elif message.get('type') == 'command_result':
                    # Pi finished executing a remote command — store the result
                    cmd_id = message.get('id', 'unknown')
                    result = {
                        'id': cmd_id,
                        'status': 'done',
                        'exit_code': message.get('exit_code'),
                        'stdout': message.get('stdout', ''),
                        'stderr': message.get('stderr', ''),
                        'command': message.get('command', ''),
                        'completed_at': message.get('timestamp'),
                    }
                    _command_results[cmd_id] = result
                    # Trim old results
                    if len(_command_results) > _MAX_RESULTS:
                        oldest = next(iter(_command_results))
                        del _command_results[oldest]
                    print(f"[RemoteCmd] Result for {cmd_id} (exit={result['exit_code']}): {result['stdout'][:200]}")
                    
            except json.JSONDecodeError:
                print("[Video Router] Invalid JSON received")
                continue
            except Exception as e:
                print(f"[Video Router] Error processing message: {e}")
                continue
                
    except WebSocketDisconnect:
        manager.disconnect_pi(websocket, client_id)
        print(f"[Video Router] Pi {client_id} disconnected")
    except Exception as e:
        print(f"[Video Router] WebSocket error: {e}")
        manager.disconnect_pi(websocket, client_id)


@router.post("/api/video-processing/set-trip")
async def set_trip(trip_data: dict):
    """Set the current trip ID for video processing"""
    trip_id = trip_data.get('trip_id')
    if trip_id:
        video_processor.set_current_trip(trip_id)
        return {'status': 'success', 'trip_id': trip_id}
    return {'status': 'error', 'message': 'trip_id required'}


@router.post("/api/video-processing/clear-trip")
async def clear_trip():
    """Clear the current trip ID"""
    video_processor.clear_current_trip()
    return {'status': 'success'}


@router.get("/api/video-processing/status")
async def get_status():
    """Get video processing service status"""
    # Fetch active trip from database if none is set
    if not video_processor.current_trip_id:
        try:
            trip_result = supabase.table('trips').select('id').eq('status', 'in_progress').order('started_at', desc=True).limit(1).execute()
            if trip_result.data and len(trip_result.data) > 0:
                video_processor.current_trip_id = trip_result.data[0]['id']
                print(f"[Video Status] Auto-set active trip: {video_processor.current_trip_id}")
        except Exception as e:
            print(f"[Video Status] Error fetching active trip: {e}")

    return {
        'model_loaded': video_processor.model is not None,
        'current_trip_id': video_processor.current_trip_id,
        'yolo_available': video_processor.model is not None
    }


@router.get("/api/video-processing/trip-video/{trip_id}")
async def get_trip_video(trip_id: str):
    """
    Get video recording information for a specific trip
    Returns the video URL and metadata if available
    """
    try:
        result = supabase.table('trips').select(
            'id, video_recording_url, video_recording_duration, video_recording_status, video_recording_file_size, video_recording_uploaded_at'
        ).eq('id', trip_id).single().execute()

        if not result.data:
            return {'status': 'error', 'message': 'Trip not found'}

        trip = result.data
        return {
            'status': 'success',
            'video_url': trip.get('video_recording_url'),
            'duration': trip.get('video_recording_duration'),
            'recording_status': trip.get('video_recording_status'),
            'file_size': trip.get('video_recording_file_size'),
            'uploaded_at': trip.get('video_recording_uploaded_at')
        }
    except Exception as e:
        print(f"[Video Router] Error fetching trip video: {e}")
        return {'status': 'error', 'message': str(e)}


@router.websocket("/ws/video-feed")
async def video_feed_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for frontend clients to receive processed video frames
    """
    await manager.connect_frontend(websocket)

    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get('type') == 'ping':
                    await websocket.send_json({'type': 'pong'})
            except:
                pass
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket)
    except Exception as e:
        print(f"[Video Router] Frontend error: {e}")
        manager.disconnect_frontend(websocket)


@router.get("/api/video-processing/download-video/{filename}")
async def download_video(filename: str, request: Request):
    """
    Serve a recorded trip video with full HTTP Range support.

    Priority:
    1. Local backend ./recordings directory (fastest)
    2. Pi proxy — fetch from the Pi tunnel stored in Supabase pi_devices
       and stream it straight through to the browser (handles Cloudflare
       interstitial that blocks browser <video> direct access).
    """
    # H3 — Path traversal protection: only allow plain filenames, no directory components
    safe_filename = os.path.basename(filename)
    if safe_filename != filename or '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail='Invalid filename')
    if not safe_filename.endswith('.mp4'):
        raise HTTPException(status_code=400, detail='Only .mp4 files are served here')

    # ── 1. Try local file first ───────────────────────────────────────────────
    VIDEO_OUTPUT_DIR = os.getenv('VIDEO_OUTPUT_DIR', './recordings')
    file_path = os.path.join(VIDEO_OUTPUT_DIR, safe_filename)

    if os.path.exists(file_path) and os.path.getsize(file_path) >= 10_000:
        file_size = os.path.getsize(file_path)
        return _range_response(file_path, file_size, request.headers.get('range'))

    # ── 2. Proxy from Pi tunnel ───────────────────────────────────────────────
    pi_url = await _get_pi_tunnel_url()
    if not pi_url:
        raise HTTPException(status_code=404, detail='Video not found locally and Pi tunnel URL unavailable')

    upstream_url = f"{pi_url.rstrip('/')}/download-video/{safe_filename}"
    range_header = request.headers.get('range')
    req_headers = {'Range': range_header} if range_header else {}

    # C1 FIX: manually manage the httpx client + stream lifecycle so that the
    # connection stays open while StreamingResponse consumes the generator.
    # H1 FIX: unlimited read timeout — only the initial connect times out at 15s.
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=15.0, read=None, write=15.0, pool=15.0),
        follow_redirects=True,
    )
    try:
        ctx = client.stream('GET', upstream_url, headers=req_headers)
        upstream = await ctx.__aenter__()

        if upstream.status_code == 404:
            await ctx.__aexit__(None, None, None)
            await client.aclose()
            raise HTTPException(status_code=404, detail='Video not found on Pi')
        if upstream.status_code not in (200, 206):
            await ctx.__aexit__(None, None, None)
            await client.aclose()
            raise HTTPException(status_code=502, detail=f'Pi returned {upstream.status_code}')

        resp_headers = {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
        }
        for h in ('content-range', 'content-length'):
            if h in upstream.headers:
                resp_headers[h.title()] = upstream.headers[h]

        async def _stream():
            """Generator that closes client/connection when exhausted or on error."""
            try:
                async for chunk in upstream.aiter_bytes(chunk_size=1024 * 512):
                    yield chunk
            finally:
                await ctx.__aexit__(None, None, None)
                await client.aclose()

        return StreamingResponse(
            _stream(),
            status_code=upstream.status_code,
            headers=resp_headers,
        )

    except HTTPException:
        raise
    except httpx.RequestError as exc:
        await client.aclose()
        print(f"[VideoProxy] Request error proxying {safe_filename}: {exc}")
        raise HTTPException(status_code=502, detail='Could not reach Pi to fetch video')
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=500, detail=str(exc))


def _range_response(file_path: str, file_size: int, range_header: str | None):
    """Return a 206 or 200 StreamingResponse for a local file."""
    chunk_size = 1024 * 1024  # 1 MB

    if range_header:
        range_val = range_header.replace('bytes=', '')
        parts = range_val.split('-')
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else min(start + chunk_size - 1, file_size - 1)
        end = min(end, file_size - 1)
        content_length = end - start + 1

        async def _ranged():
            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    data = f.read(min(chunk_size, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(_ranged(), status_code=206, headers={
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Content-Length': str(content_length),
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
        })

    async def _full():
        with open(file_path, 'rb') as f:
            while True:
                data = f.read(chunk_size)
                if not data:
                    break
                yield data

    return StreamingResponse(_full(), status_code=200, headers={
        'Content-Length': str(file_size),
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
    })


async def _get_pi_tunnel_url() -> str:
    """Fetch the latest Pi tunnel URL from Supabase pi_devices."""
    try:
        result = supabase.table('pi_devices') \
            .select('backend_url') \
            .eq('bus_number', 1) \
            .order('last_seen', desc=True) \
            .limit(1) \
            .execute()
        if result.data:
            return result.data[0].get('backend_url', '')
    except Exception as e:
        print(f"[VideoProxy] Could not fetch Pi URL from Supabase: {e}")
    return ''


@router.get("/api/video-processing/recordings")
async def get_recordings(trip_id: str = None, limit: int = 50, offset: int = 0):
    """
    Get list of video recordings from video_recordings table
    Optionally filter by trip_id
    """
    try:
        query = supabase.table('video_recordings').select('*')
        if trip_id:
            query = query.eq('trip_id', trip_id)
        result = query.order('recorded_at', {'ascending': False}).range(offset, offset + limit - 1).execute()
        return {'status': 'success', 'data': result.data or []}
    except Exception as e:
        print(f"[Video Router] Error fetching recordings: {e}")
        return {'status': 'error', 'message': str(e)}
