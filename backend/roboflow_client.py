"""
Roboflow Workflow Client
Integrates with Roboflow serverless workflows for object detection
"""
import os
import base64
import asyncio
from typing import Dict, List, Any, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

class RoboflowWorkflowError(Exception):
    """Custom exception for Roboflow workflow errors"""
    pass

class RoboflowClient:
    """Client for Roboflow serverless workflows"""

    def __init__(self):
        self.api_key = None  # Will be set by video_processor
        self.workspace = "kristines-workspace-dzpjm"
        self.workflow_id = "bus-vbus-xtidt-jyqan-1-rfdetr-nas-t1-718e59-logic"
        self.api_url = "https://serverless.roboflow.com"
        self.timeout = 30.0
        self.max_retries = 3

    def _encode_image(self, image_bytes: bytes) -> str:
        """Encode image bytes to base64"""
        return base64.b64encode(image_bytes).decode('utf-8')

    async def run_workflow(
        self,
        image_bytes: bytes,
        parameters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Run Roboflow workflow on an image

        Args:
            image_bytes: Raw image bytes (from OpenCV or file)
            parameters: Optional workflow parameters

        Returns:
            Dict containing workflow results

        Raises:
            RoboflowWorkflowError: If workflow execution fails
        """
        if not self.api_key:
            raise RoboflowWorkflowError("ROBOFLOW_API_KEY not configured in .env")

        if not image_bytes:
            raise RoboflowWorkflowError("Image bytes cannot be empty")

        # Prepare request payload
        payload = {
            "inputs": {
                "image": {
                    "type": "base64",
                    "value": self._encode_image(image_bytes)
                }
            }
        }

        if parameters:
            payload["parameters"] = parameters

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        url = f"{self.api_url}/{self.workspace}/workflows/{self.workflow_id}"

        # Retry logic with exponential backoff
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                    result = response.json()

                    # Parse the response - workflow returns a list with one entry per input
                    if isinstance(result, list) and len(result) > 0:
                        return result[0]
                    return result

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    raise RoboflowWorkflowError("Invalid Roboflow API key")
                elif e.response.status_code == 429:
                    # Rate limited - wait and retry
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise RoboflowWorkflowError(f"HTTP error: {e.response.status_code}")

            except httpx.TimeoutException:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise RoboflowWorkflowError("Request timed out")

            except Exception as e:
                raise RoboflowWorkflowError(f"Workflow execution failed: {str(e)}")

        raise RoboflowWorkflowError("Max retries exceeded")

    def extract_detections(self, workflow_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract detection results from workflow response

        Args:
            workflow_result: Raw workflow response

        Returns:
            List of detection dictionaries with bbox, confidence, class
        """
        detections = []

        # Parse based on actual workflow output structure
        # This will be defensive and handle various output formats
        if "predictions" in workflow_result:
            predictions = workflow_result["predictions"]
            for pred in predictions:
                detections.append({
                    "bbox": pred.get("bbox", []),
                    "confidence": pred.get("confidence", 0.0),
                    "class": pred.get("class", "unknown")
                })
        elif "detections" in workflow_result:
            for det in workflow_result["detections"]:
                detections.append({
                    "bbox": det.get("bbox", []),
                    "confidence": det.get("confidence", 0.0),
                    "class": det.get("class", "unknown")
                })

        return detections

    def extract_passenger_count(self, workflow_result: Dict[str, Any]) -> int:
        """
        Extract passenger count from workflow response

        Args:
            workflow_result: Raw workflow response

        Returns:
            Number of passengers detected
        """
        detections = self.extract_detections(workflow_result)
        return len(detections)

# Global client instance
roboflow_client = RoboflowClient()
