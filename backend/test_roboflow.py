"""
Test script for Roboflow workflow integration
"""
import asyncio
import cv2
import os
from roboflow_client import roboflow_client, RoboflowWorkflowError

async def test_roboflow_workflow():
    """Test Roboflow workflow with a sample image"""
    print("[Test] Testing Roboflow workflow integration...")

    # Check if API key is configured
    if not roboflow_client.api_key:
        print("[Test] ERROR: ROBOFLOW_API_KEY not set in environment")
        print("[Test] Please set ROBOFLOW_API_KEY in backend/.env")
        return False

    # Create a simple test image (or use an existing one)
    test_image_path = "test_image.jpg"

    # If no test image exists, create a simple one
    if not os.path.exists(test_image_path):
        print(f"[Test] Creating test image: {test_image_path}")
        # Create a simple 640x480 black image
        import numpy as np
        test_image = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.imwrite(test_image_path, test_image)

    # Read the test image
    try:
        with open(test_image_path, 'rb') as f:
            image_bytes = f.read()
        print(f"[Test] Read test image: {len(image_bytes)} bytes")
    except Exception as e:
        print(f"[Test] ERROR: Failed to read test image: {e}")
        return False

    # Run the workflow
    try:
        print("[Test] Running Roboflow workflow...")
        result = await roboflow_client.run_workflow(image_bytes)
        print(f"[Test] Workflow result type: {type(result)}")
        print(f"[Test] Workflow result keys: {result.keys() if isinstance(result, dict) else 'N/A'}")

        # Extract detections
        detections = roboflow_client.extract_detections(result)
        passenger_count = roboflow_client.extract_passenger_count(result)

        print(f"[Test] Detected {passenger_count} passengers")
        print(f"[Test] Detections: {detections}")

        # Verify expected output structure
        if isinstance(result, dict):
            print("[Test] SUCCESS: Workflow returned a dictionary")
            return True
        else:
            print(f"[Test] WARNING: Unexpected result type: {type(result)}")
            return False

    except RoboflowWorkflowError as e:
        print(f"[Test] ERROR: Roboflow workflow failed: {e}")
        return False
    except Exception as e:
        print(f"[Test] ERROR: Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_roboflow_workflow())
    if success:
        print("\n[Test] PASSED: Roboflow integration working")
    else:
        print("\n[Test] FAILED: Roboflow integration not working")
