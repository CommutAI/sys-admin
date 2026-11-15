import os
import glob
import subprocess

recordings_dir = "/home/chichi/raspberry-pi-server/recordings"
files = sorted(glob.glob(os.path.join(recordings_dir, "*.mp4")))
print(f"Found {len(files)} mp4 files.")

for f in files:
    if f.endswith(".tmp.mp4") or "temp" in f:
        continue
    try:
        codec = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", f],
            text=True
        ).strip()
    except Exception as e:
        print(f"Error probing {os.path.basename(f)}: {e}")
        continue

    size_mb = os.path.getsize(f) / (1024 * 1024)
    print(f"{os.path.basename(f)}: {codec} ({size_mb:.2f} MB)")

    if codec == "mpeg4":
        tmp_out = f + ".h264.mp4"
        print(f"  -> Converting to H.264 (+faststart)...")
        cmd = [
            "ffmpeg", "-y", "-i", f,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            tmp_out
        ]
        ret = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ret.returncode == 0 and os.path.exists(tmp_out) and os.path.getsize(tmp_out) > 1000:
            os.replace(tmp_out, f)
            new_sz = os.path.getsize(f) / (1024 * 1024)
            print(f"  -> Transcode successful! New size: {new_sz:.2f} MB")
        else:
            if os.path.exists(tmp_out):
                os.remove(tmp_out)
            print(f"  -> Transcode failed for {os.path.basename(f)}")

print("Batch processing complete.")
