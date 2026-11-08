"""
Multi-Scenario Anomaly Detection System (Enhanced)
Detects 8 different types of anomalies with detailed metrics, recommendations, and context

Anomaly Types:
1. Fare Evasion (count_mismatch) - AI count vs boarded count
2. Overcrowding - AI count > bus capacity
3. Staff Absence - AI count > 0 but no staff assigned
4. Camera Malfunction - Zero counts for >5 minutes
5. Passenger Spike - Sudden count increase > 5 in 10 seconds
6. Trip Duration - Trip exceeds expected time
7. Route Deviation - Bus not on expected route
8. Boarding Rate - Abnormal boarding rate

Severity Levels:
- low: Minor issue, monitor
- medium: Attention needed, investigate
- high: Serious issue, immediate action required
- critical: Emergency, immediate intervention
- emergency: Life-threatening, immediate evacuation/safety measures
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from database import supabase

router = APIRouter()


class AnomalyMetrics(BaseModel):
    """Detailed metrics for an anomaly"""
    current_value: float
    threshold_value: float
    percentage_above_threshold: float
    historical_average: Optional[float]
    trend: Optional[str]  # increasing, decreasing, stable
    duration_minutes: Optional[float]
    affected_passengers: int


class AnomalyRecommendation(BaseModel):
    """Actionable recommendation for an anomaly"""
    priority: str
    action: str
    details: str
    estimated_impact: str


class AnomalyResult(BaseModel):
    """Result of a single anomaly check with full details"""
    anomaly_type: str
    detected: bool
    severity: str
    confidence: float  # 0.0 to 1.0
    description: str
    metrics: Optional[AnomalyMetrics]
    recommendation: Optional[AnomalyRecommendation]
    irregularity_created: bool
    irregularity_id: Optional[str]
    first_detected_at: Optional[str]
    last_updated_at: str


class TripAnomalySummary(BaseModel):
    """Summary of all anomalies for a trip with full context"""
    trip_id: str
    bus_plate: Optional[str]
    bus_capacity: Optional[int]
    ai_count: int
    boarded_count: int
    staff_count: int
    expected_passengers: int
    discrepancy: int
    trip_duration_minutes: Optional[float]
    trip_progress_percentage: Optional[float]
    anomalies: List[AnomalyResult]
    total_anomalies: int
    total_irregularities_created: int
    critical_anomalies: int
    high_anomalies: int
    medium_anomalies: int
    low_anomalies: int


class AnomalyDetectionSummary(BaseModel):
    """Summary of anomaly detection across all active trips"""
    total_trips_checked: int
    total_anomalies_detected: int
    total_irregularities_created: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    results: List[TripAnomalySummary]
    checked_at: str


# ============================================================================
# Helper Functions
# ============================================================================

def calculate_severity_from_percentage(percentage: float) -> str:
    """Calculate severity based on percentage above threshold"""
    if percentage < 10:
        return "low"
    elif percentage < 25:
        return "medium"
    elif percentage < 50:
        return "high"
    elif percentage < 100:
        return "critical"
    else:
        return "emergency"


def calculate_confidence(data_points: int, variance: float) -> float:
    """Calculate confidence score based on data quality"""
    if data_points < 3:
        return 0.3
    elif data_points < 10:
        return 0.6
    elif variance > 50:
        return 0.5
    else:
        return 0.9


def get_historical_average(trip_id: str, minutes_back: int = 30) -> Optional[float]:
    """Get historical average for comparison"""
    time_ago = (datetime.now(timezone.utc) - timedelta(minutes=minutes_back)).isoformat()
    result = supabase.table('passenger_counts').select('count').eq('trip_id', trip_id).gte('recorded_at', time_ago).execute()
    if result.data:
        counts = [c.get('count', 0) for c in result.data]
        return sum(counts) / len(counts) if counts else None
    return None


def get_trend(trip_id: str, minutes_back: int = 30) -> Optional[str]:
    """Determine if counts are increasing, decreasing, or stable"""
    time_ago = (datetime.now(timezone.utc) - timedelta(minutes=minutes_back)).isoformat()
    result = supabase.table('passenger_counts').select('count, recorded_at').eq('trip_id', trip_id).gte('recorded_at', time_ago).order('recorded_at', desc=True).limit(10).execute()
    
    if result.data and len(result.data) >= 3:
        counts = [c.get('count', 0) for c in result.data]
        recent_avg = sum(counts[:3]) / 3
        older_avg = sum(counts[-3:]) / 3
        
        if recent_avg > older_avg * 1.1:
            return "increasing"
        elif recent_avg < older_avg * 0.9:
            return "decreasing"
        else:
            return "stable"
    return None


# ============================================================================
# Individual Anomaly Detection Functions (Enhanced)
# ============================================================================

def detect_fare_evasion(trip: Dict, ai_count: int, boarded_count: int, staff_count: int, threshold: int = 2) -> AnomalyResult:
    """Scenario 1: Fare Evasion - AI count minus staff doesn't match boarded count"""
    expected_passengers = max(0, ai_count - staff_count)
    discrepancy = abs(expected_passengers - boarded_count)
    detected = discrepancy >= threshold
    
    # Calculate metrics
    current_value = float(discrepancy)
    threshold_value = float(threshold)
    percentage_above = ((current_value - threshold_value) / threshold_value * 100) if threshold_value > 0 else 0
    historical_avg = get_historical_average(trip['id'])
    trend = get_trend(trip['id'])
    
    severity = calculate_severity_from_percentage(percentage_above)
    confidence = calculate_confidence(10, discrepancy if historical_avg else 0)
    
    # Build detailed description
    description = (
        f"Fare Evasion Detected: Camera count {ai_count} minus {staff_count} staff = {expected_passengers} expected, "
        f"but {boarded_count} passengers boarded. Discrepancy: {discrepancy} ({percentage_above:.1f}% above threshold). "
        f"Trend: {trend or 'unknown'}, Historical avg discrepancy: {historical_avg:.1f if historical_avg else 'N/A'}"
    )
    
    # Generate recommendation
    if severity in ['critical', 'emergency']:
        recommendation = AnomalyRecommendation(
            priority="IMMEDIATE",
            action="Dispatch staff to verify passenger counts",
            details=f"Severe fare evasion detected with {discrepancy} unaccounted passengers. "
                    f"Immediate verification required to prevent revenue loss.",
            estimated_impact=f"High revenue loss: {discrepancy} uncollected fares"
        )
    elif severity == 'high':
        recommendation = AnomalyRecommendation(
            priority="HIGH",
            action="Review boarding records and increase monitoring",
            details=f"Significant fare evasion pattern detected. Review recent boardings and "
                    f"consider increased staff presence.",
            estimated_impact=f"Moderate revenue loss: {discrepancy} uncollected fares"
        )
    else:
        recommendation = AnomalyRecommendation(
            priority="MEDIUM",
            action="Monitor for patterns",
            details=f"Minor discrepancy detected. Continue monitoring for escalation.",
            estimated_impact=f"Minimal revenue impact"
        )
    
    metrics = AnomalyMetrics(
        current_value=current_value,
        threshold_value=threshold_value,
        percentage_above_threshold=percentage_above,
        historical_average=historical_avg,
        trend=trend,
        duration_minutes=None,
        affected_passengers=discrepancy
    )
    
    return AnomalyResult(
        anomaly_type="count_mismatch",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_overcrowding(trip: Dict, ai_count: int, bus_capacity: int = 50) -> AnomalyResult:
    """Scenario 2: Overcrowding - AI count exceeds bus capacity"""
    detected = ai_count > bus_capacity
    over_by = ai_count - bus_capacity
    percentage_over = (over_by / bus_capacity * 100) if bus_capacity > 0 else 0
    
    severity = calculate_severity_from_percentage(percentage_over)
    confidence = 0.95  # High confidence for count-based detection
    
    historical_avg = get_historical_average(trip['id'])
    trend = get_trend(trip['id'])
    
    description = (
        f"Overcrowding Alert: {ai_count} passengers detected (capacity: {bus_capacity}). "
        f"Over capacity by {over_by} passengers ({percentage_over:.1f}%). "
        f"Safety risk level: {severity.upper()}. Trend: {trend or 'unknown'}."
    )
    
    if severity in ['critical', 'emergency']:
        recommendation = AnomalyRecommendation(
            priority="EMERGENCY",
            action="Stop boarding immediately, consider offloading passengers",
            details=f"CRITICAL: Bus severely overcrowded ({percentage_over:.1f}% over capacity). "
                    f"Immediate action required to prevent safety violations and potential accidents.",
            estimated_impact="Life-safety risk, legal liability, passenger injury"
        )
    elif severity == 'high':
        recommendation = AnomalyRecommendation(
            priority="HIGH",
            action="Limit boarding, inform passengers of capacity",
            details=f"Bus approaching capacity limits. Stop accepting new passengers and "
                    f"consider additional vehicle dispatch.",
            estimated_impact="Safety violation risk, passenger discomfort"
        )
    else:
        recommendation = AnomalyRecommendation(
            priority="MEDIUM",
            action="Monitor closely, prepare contingency",
            details=f"Bus nearing capacity. Monitor boarding rate and prepare contingency plan.",
            estimated_impact="Potential capacity issues"
        )
    
    metrics = AnomalyMetrics(
        current_value=float(ai_count),
        threshold_value=float(bus_capacity),
        percentage_above_threshold=percentage_over,
        historical_average=historical_avg,
        trend=trend,
        duration_minutes=None,
        affected_passengers=ai_count
    )
    
    return AnomalyResult(
        anomaly_type="overcrowding",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_staff_absence(trip: Dict, ai_count: int) -> AnomalyResult:
    """Scenario 3: Staff Absence - AI count > 0 but no conductor/driver assigned"""
    conductor_id = trip.get('conductor_id')
    driver_id = trip.get('driver_id')
    has_conductor = bool(conductor_id)
    has_driver = bool(driver_id)
    has_staff = has_conductor or has_driver
    
    detected = ai_count > 0 and not has_staff
    severity = "critical" if detected else "low"
    confidence = 1.0  # Database lookup is definitive
    
    missing_staff = []
    if not has_conductor:
        missing_staff.append("conductor")
    if not has_driver:
        missing_staff.append("driver")
    
    description = (
        f"Staff Absence Alert: {ai_count} passengers detected but {'no staff' if not has_staff else 'staff present'}. "
        f"Missing: {', '.join(missing_staff) if missing_staff else 'none'}. "
        f"Conductor assigned: {'Yes' if has_conductor else 'No'}, Driver assigned: {'Yes' if has_driver else 'No'}."
    )
    
    if detected:
        recommendation = AnomalyRecommendation(
            priority="EMERGENCY",
            action="IMMEDIATE: Assign staff or suspend operations",
            details=f"CRITICAL: Passengers on board without assigned staff. "
                    f"Immediate intervention required for safety and legal compliance.",
            estimated_impact="Life-safety risk, legal liability, insurance void"
        )
    else:
        recommendation = None
    
    metrics = AnomalyMetrics(
        current_value=float(ai_count),
        threshold_value=0.0,
        percentage_above_threshold=100.0 if detected else 0.0,
        historical_average=None,
        trend=None,
        duration_minutes=None,
        affected_passengers=ai_count
    )
    
    return AnomalyResult(
        anomaly_type="staff_absence",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_camera_malfunction(trip_id: str) -> AnomalyResult:
    """Scenario 4: Camera Malfunction - Zero counts for >5 minutes"""
    five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    
    count_result = supabase.table('passenger_counts').select('count, recorded_at').eq('trip_id', trip_id).gte('recorded_at', five_minutes_ago).execute()
    
    detected = False
    duration_minutes = 0.0
    confidence = 0.0
    
    if count_result.data:
        all_zero = all(c.get('count', 0) == 0 for c in count_result.data)
        detected = all_zero and len(count_result.data) > 0
        duration_minutes = 5.0
        confidence = 0.9 if len(count_result.data) > 10 else 0.6
    else:
        # No counts in last 5 minutes
        detected = True
        duration_minutes = 5.0
        confidence = 0.8
    
    severity = "high" if detected else "low"
    
    description = (
        f"Camera Status: {'MALFUNCTION DETECTED' if detected else 'FUNCTIONING NORMALLY'}. "
        f"Zero counts reported for {duration_minutes:.0f} minutes. "
        f"Data points in last 5 min: {len(count_result.data) if count_result.data else 0}. "
        f"Confidence: {confidence:.0%}."
    )
    
    if detected:
        recommendation = AnomalyRecommendation(
            priority="HIGH",
            action="Inspect camera hardware and connection",
            details=f"Camera may be malfunctioning or disconnected. "
                    f"Check physical connection, power supply, and restart camera service.",
            estimated_impact="No passenger counting, fare evasion undetected"
        )
    else:
        recommendation = None
    
    metrics = AnomalyMetrics(
        current_value=0.0,
        threshold_value=1.0,
        percentage_above_threshold=0.0,
        historical_average=None,
        trend=None,
        duration_minutes=duration_minutes,
        affected_passengers=0
    )
    
    return AnomalyResult(
        anomaly_type="camera_malfunction",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_passenger_spike(trip_id: str) -> AnomalyResult:
    """Scenario 5: Passenger Spike - Sudden count increase > 5 in 10 seconds"""
    ten_seconds_ago = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    
    count_result = supabase.table('passenger_counts').select('count, recorded_at').eq('trip_id', trip_id).gte('recorded_at', ten_seconds_ago).order('recorded_at', desc=True).limit(20).execute()
    
    detected = False
    spike_magnitude = 0.0
    confidence = 0.0
    
    if count_result.data and len(count_result.data) >= 2:
        counts = [c.get('count', 0) for c in count_result.data]
        max_count = max(counts)
        min_count = min(counts)
        spike_magnitude = max_count - min_count
        detected = spike_magnitude > 5
        confidence = 0.85 if len(counts) > 5 else 0.6
    
    severity = "medium" if detected else "low"
    percentage_above = (spike_magnitude / 5.0 * 100) if spike_magnitude > 0 else 0
    
    description = (
        f"Passenger Flow: {'SPIKE DETECTED' if detected else 'NORMAL'}. "
        f"Count change in last 10 seconds: {spike_magnitude:.0f} passengers "
        f"({percentage_above:.0f}% above threshold). "
        f"Data points: {len(count_result.data) if count_result.data else 0}."
    )
    
    if detected:
        recommendation = AnomalyRecommendation(
            priority="MEDIUM",
            action="Monitor for fare evasion during spike",
            details=f"Rapid passenger increase detected. This may indicate "
                    f"boarding rush, unauthorized stops, or fare evasion attempts.",
            estimated_impact="Potential fare evasion during high-volume boarding"
        )
    else:
        recommendation = None
    
    metrics = AnomalyMetrics(
        current_value=spike_magnitude,
        threshold_value=5.0,
        percentage_above_threshold=percentage_above,
        historical_average=None,
        trend="spike" if detected else "stable",
        duration_minutes=0.17,  # 10 seconds
        affected_passengers=int(spike_magnitude)
    )
    
    return AnomalyResult(
        anomaly_type="passenger_spike",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_trip_duration(trip: Dict) -> AnomalyResult:
    """Scenario 6: Trip Duration - Trip exceeds expected time by >30 minutes"""
    started_at = trip.get('started_at')
    expected_duration = trip.get('expected_duration_minutes', 60)
    
    detected = False
    elapsed_minutes = 0.0
    delay_minutes = 0.0
    confidence = 0.0
    
    if started_at:
        start_time = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        elapsed_minutes = (datetime.now(timezone.utc) - start_time).total_seconds() / 60
        delay_minutes = elapsed_minutes - expected_duration
        detected = delay_minutes > 30
        confidence = 0.95
    else:
        confidence = 0.0
    
    severity = calculate_severity_from_percentage((delay_minutes / 30.0 * 100) if delay_minutes > 0 else 0)
    percentage_above = (delay_minutes / 30.0 * 100) if delay_minutes > 0 else 0
    
    description = (
        f"Trip Duration: {'DELAYED' if detected else 'ON SCHEDULE'}. "
        f"Elapsed: {elapsed_minutes:.0f} min, Expected: {expected_duration} min, "
        f"Delay: {delay_minutes:.0f} min ({percentage_above:.0f}% above threshold). "
        f"Started: {started_at or 'Unknown'}."
    )
    
    if detected:
        recommendation = AnomalyRecommendation(
            priority="MEDIUM",
            action="Investigate cause of delay",
            details=f"Trip significantly delayed. Check for traffic, mechanical issues, "
                    f"or unauthorized stops. Update passengers on ETA.",
            estimated_impact="Schedule disruption, passenger inconvenience"
        )
    else:
        recommendation = None
    
    metrics = AnomalyMetrics(
        current_value=elapsed_minutes,
        threshold_value=float(expected_duration + 30),
        percentage_above_threshold=percentage_above,
        historical_average=None,
        trend="delayed" if detected else "on_time",
        duration_minutes=elapsed_minutes,
        affected_passengers=0
    )
    
    return AnomalyResult(
        anomaly_type="trip_duration",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_route_deviation(trip: Dict) -> AnomalyResult:
    """Scenario 7: Route Deviation - Bus not on expected route (placeholder for GPS integration)"""
    # TODO: Implement actual GPS route checking
    # This would compare current GPS location with expected route waypoints
    detected = False
    severity = "low"
    confidence = 0.0
    
    description = (
        f"Route Status: Monitoring (GPS integration pending). "
        f"Currently unable to verify route adherence. "
        f"Implement GPS waypoint comparison for full functionality."
    )
    
    recommendation = AnomalyRecommendation(
        priority="LOW",
        action="Implement GPS route monitoring",
        details="Route deviation detection requires GPS integration with route waypoints.",
        estimated_impact="Unable to detect unauthorized route deviations"
    )
    
    metrics = AnomalyMetrics(
        current_value=0.0,
        threshold_value=0.0,
        percentage_above_threshold=0.0,
        historical_average=None,
        trend=None,
        duration_minutes=None,
        affected_passengers=0
    )
    
    return AnomalyResult(
        anomaly_type="route_deviation",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def detect_boarding_rate(trip_id: str) -> AnomalyResult:
    """Scenario 8: Boarding Rate - Abnormal boarding rate (too many/few per minute)"""
    one_minute_ago = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    
    boarded_result = supabase.table('boarded_passengers').select('id, boarded_at').eq('trip_id', trip_id).gte('boarded_at', one_minute_ago).execute()
    boarding_rate = len(boarded_result.data) if boarded_result.data else 0
    
    # Also check 5-minute average for context
    five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    boarded_5min = supabase.table('boarded_passengers').select('id').eq('trip_id', trip_id).gte('boarded_at', five_minutes_ago).execute()
    avg_rate_5min = (len(boarded_5min.data) if boarded_5min.data else 0) / 5.0
    
    detected = boarding_rate > 10
    severity = "medium" if detected else "low"
    confidence = 0.9 if boarding_rate > 0 else 0.5
    percentage_above = (boarding_rate / 10.0 * 100) if boarding_rate > 0 else 0
    
    description = (
        f"Boarding Rate: {'ABNORMAL' if detected else 'NORMAL'}. "
        f"Current: {boarding_rate} passengers/min (1-min window), "
        f"5-min average: {avg_rate_5min:.1f} passengers/min. "
        f"Threshold: 10 passengers/min. ({percentage_above:.0f}% above threshold)."
    )
    
    if detected:
        recommendation = AnomalyRecommendation(
            priority="MEDIUM",
            action="Verify boarding process, check for fare evasion",
            details=f"High boarding rate detected. May indicate crowded stops, "
                    f"fare evasion during rush, or system error. Verify manual counts.",
            estimated_impact="Potential fare evasion during high-volume boarding"
        )
    else:
        recommendation = None
    
    metrics = AnomalyMetrics(
        current_value=float(boarding_rate),
        threshold_value=10.0,
        percentage_above_threshold=percentage_above,
        historical_average=avg_rate_5min,
        trend="high" if detected else "normal",
        duration_minutes=1.0,
        affected_passengers=boarding_rate
    )
    
    return AnomalyResult(
        anomaly_type="boarding_rate",
        detected=detected,
        severity=severity,
        confidence=confidence,
        description=description,
        metrics=metrics,
        recommendation=recommendation,
        irregularity_created=False,
        irregularity_id=None,
        first_detected_at=None,
        last_updated_at=datetime.now(timezone.utc).isoformat()
    )


def create_irregularity(trip_id: str, anomaly: AnomalyResult) -> Optional[str]:
    """Create an irregularity record with full details if one doesn't exist in the last 10 minutes"""
    recent_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    
    existing_result = supabase.table('fare_irregularities').select('id').eq('trip_id', trip_id).eq('anomaly_type', anomaly.anomaly_type).eq('resolved', False).gte('detected_at', recent_time).execute()
    
    if existing_result.data:
        return None  # Already exists
    
    now = datetime.now(timezone.utc).isoformat()
    irregularity_data = {
        'trip_id': trip_id,
        'type': anomaly.anomaly_type,
        'anomaly_type': anomaly.anomaly_type,
        'severity': anomaly.severity,
        'description': anomaly.description,
        'detected_at': now,
        'first_detected_at': now,
        'last_updated_at': now,
        'status': 'new',
        'resolved': False
    }
    
    irregularity_result = supabase.table('fare_irregularities').insert(irregularity_data).execute()
    if irregularity_result.data:
        irregularity_id = irregularity_result.data[0]['id']
        
        # Create history entry
        history_data = {
            'irregularity_id': irregularity_id,
            'changed_at': now,
            'old_status': None,
            'new_status': 'new',
            'old_severity': None,
            'new_severity': anomaly.severity,
            'change_type': 'created',
            'notes': f"Automatically created by anomaly detection system. Type: {anomaly.anomaly_type}, Severity: {anomaly.severity}"
        }
        supabase.table('irregularity_history').insert(history_data).execute()
        
        return irregularity_id
    return None


# ============================================================================
# Main Detection Endpoint
# ============================================================================

@router.post("/detect", response_model=AnomalyDetectionSummary)
async def detect_anomalies(
    threshold: int = 2,
    check_all_active: bool = True,
    trip_id: Optional[str] = None,
    scenarios: Optional[List[str]] = None
):
    """
    Detect multiple types of anomalies across trips with detailed metrics and recommendations
    
    Args:
        threshold: Discrepancy threshold for fare evasion (default: 2)
        check_all_active: Check all active trips or specific trip_id
        trip_id: Specific trip to check
        scenarios: List of scenarios to check (default: all)
                   Options: count_mismatch, overcrowding, staff_absence, 
                            camera_malfunction, passenger_spike, trip_duration,
                            route_deviation, boarding_rate
    """
    try:
        if scenarios is None:
            scenarios = ['count_mismatch', 'overcrowding', 'staff_absence', 'camera_malfunction', 
                        'passenger_spike', 'trip_duration', 'route_deviation', 'boarding_rate']
        
        results = []
        total_anomalies_detected = 0
        total_irregularities_created = 0
        critical_count = 0
        high_count = 0
        medium_count = 0
        low_count = 0
        
        # Get trips to check
        if trip_id:
            trip_result = supabase.table('trips').select(
                'id, bus_id, conductor_id, driver_id, status, started_at, expected_duration_minutes, buses(plate_number, capacity)'
            ).eq('id', trip_id).execute()
            trips = trip_result.data if trip_result.data else []
        elif check_all_active:
            trip_result = supabase.table('trips').select(
                'id, bus_id, conductor_id, driver_id, status, started_at, expected_duration_minutes, buses(plate_number, capacity)'
            ).eq('status', 'in_progress').execute()
            trips = trip_result.data if trip_result.data else []
        else:
            return AnomalyDetectionSummary(
                total_trips_checked=0,
                total_anomalies_detected=0,
                total_irregularities_created=0,
                critical_count=0,
                high_count=0,
                medium_count=0,
                low_count=0,
                results=[],
                checked_at=datetime.now(timezone.utc).isoformat()
            )
        
        if not trips:
            return AnomalyDetectionSummary(
                total_trips_checked=0,
                total_anomalies_detected=0,
                total_irregularities_created=0,
                critical_count=0,
                high_count=0,
                medium_count=0,
                low_count=0,
                results=[],
                checked_at=datetime.now(timezone.utc).isoformat()
            )
        
        # Check each trip
        for trip in trips:
            trip_id = trip['id']
            bus_info = trip.get('buses', {})
            bus_plate = bus_info.get('plate_number', 'Unknown')
            bus_capacity = bus_info.get('capacity', 50)
            conductor_id = trip.get('conductor_id')
            driver_id = trip.get('driver_id')
            
            # Count staff
            staff_count = 0
            if conductor_id:
                staff_count += 1
            if driver_id:
                staff_count += 1
            
            # Get latest AI count
            count_result = supabase.table('passenger_counts').select(
                'count, ai_count, recorded_at'
            ).eq('trip_id', trip_id).order('recorded_at', desc=True).limit(1).execute()
            
            ai_count = 0
            if count_result.data:
                ai_count = count_result.data[0].get('ai_count') or count_result.data[0].get('count', 0)
            
            # Get boarded count
            boarded_result = supabase.table('boarded_passengers').select('id').eq('trip_id', trip_id).execute()
            boarded_count = len(boarded_result.data) if boarded_result.data else 0
            
            # Calculate trip duration
            started_at = trip.get('started_at')
            trip_duration_minutes = 0.0
            trip_progress_percentage = 0.0
            expected_duration = trip.get('expected_duration_minutes', 60)
            
            if started_at:
                start_time = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
                trip_duration_minutes = (datetime.now(timezone.utc) - start_time).total_seconds() / 60
                trip_progress_percentage = min(100, (trip_duration_minutes / expected_duration * 100)) if expected_duration > 0 else 0
            
            # Run all anomaly scenarios
            anomalies = []
            trip_critical = 0
            trip_high = 0
            trip_medium = 0
            trip_low = 0
            
            for scenario in scenarios:
                anomaly_result = None
                
                if scenario == 'count_mismatch':
                    anomaly_result = detect_fare_evasion(trip, ai_count, boarded_count, staff_count, threshold)
                elif scenario == 'overcrowding':
                    anomaly_result = detect_overcrowding(trip, ai_count, bus_capacity)
                elif scenario == 'staff_absence':
                    anomaly_result = detect_staff_absence(trip, ai_count)
                elif scenario == 'camera_malfunction':
                    anomaly_result = detect_camera_malfunction(trip_id)
                elif scenario == 'passenger_spike':
                    anomaly_result = detect_passenger_spike(trip_id)
                elif scenario == 'trip_duration':
                    anomaly_result = detect_trip_duration(trip)
                elif scenario == 'route_deviation':
                    anomaly_result = detect_route_deviation(trip)
                elif scenario == 'boarding_rate':
                    anomaly_result = detect_boarding_rate(trip_id)
                
                if anomaly_result and anomaly_result.detected:
                    # Count by severity
                    if anomaly_result.severity == 'critical':
                        trip_critical += 1
                        critical_count += 1
                    elif anomaly_result.severity == 'high':
                        trip_high += 1
                        high_count += 1
                    elif anomaly_result.severity == 'medium':
                        trip_medium += 1
                        medium_count += 1
                    elif anomaly_result.severity == 'low':
                        trip_low += 1
                        low_count += 1
                    
                    # Create irregularity if needed
                    irregularity_id = create_irregularity(trip_id, anomaly_result)
                    if irregularity_id:
                        anomaly_result.irregularity_created = True
                        anomaly_result.irregularity_id = irregularity_id
                        total_irregularities_created += 1
                    total_anomalies_detected += 1
                
                if anomaly_result:
                    anomalies.append(anomaly_result)
            
            # Calculate fare evasion stats
            expected_passengers = max(0, ai_count - staff_count)
            discrepancy = abs(expected_passengers - boarded_count)
            
            results.append(TripAnomalySummary(
                trip_id=trip_id,
                bus_plate=bus_plate,
                bus_capacity=bus_capacity,
                ai_count=ai_count,
                boarded_count=boarded_count,
                staff_count=staff_count,
                expected_passengers=expected_passengers,
                discrepancy=discrepancy,
                trip_duration_minutes=trip_duration_minutes,
                trip_progress_percentage=trip_progress_percentage,
                anomalies=anomalies,
                total_anomalies=len([a for a in anomalies if a.detected]),
                total_irregularities_created=len([a for a in anomalies if a.irregularity_created]),
                critical_anomalies=trip_critical,
                high_anomalies=trip_high,
                medium_anomalies=trip_medium,
                low_anomalies=trip_low
            ))
        
        return AnomalyDetectionSummary(
            total_trips_checked=len(trips),
            total_anomalies_detected=total_anomalies_detected,
            total_irregularities_created=total_irregularities_created,
            critical_count=critical_count,
            high_count=high_count,
            medium_count=medium_count,
            low_count=low_count,
            results=results,
            checked_at=datetime.now(timezone.utc).isoformat()
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Export function for background scheduler
async def run_anomaly_detection():
    """Wrapper function for calling from scheduler - checks all scenarios"""
    return await detect_anomalies(threshold=2, check_all_active=True)


@router.get("/status/{trip_id}")
async def get_anomaly_status(trip_id: str):
    """Get current anomaly status for a specific trip with all anomaly types"""
    try:
        trip_result = supabase.table('trips').select(
            'id, bus_id, conductor_id, driver_id, status, started_at, expected_duration_minutes, buses(plate_number, capacity)'
        ).eq('id', trip_id).execute()
        
        if not trip_result.data:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        trip = trip_result.data[0]
        
        # Get all active irregularities for this trip
        irregularity_result = supabase.table('fare_irregularities').select('*').eq('trip_id', trip_id).eq('resolved', False).execute()
        active_irregularities = irregularity_result.data if irregularity_result.data else []
        
        return {
            'trip_id': trip_id,
            'active_irregularities': active_irregularities,
            'active_irregularity_count': len(active_irregularities),
            'by_severity': {
                'critical': len([i for i in active_irregularities if i.get('severity') == 'critical']),
                'high': len([i for i in active_irregularities if i.get('severity') == 'high']),
                'medium': len([i for i in active_irregularities if i.get('severity') == 'medium']),
                'low': len([i for i in active_irregularities if i.get('severity') == 'low'])
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve/{irregularity_id}")
async def resolve_irregularity(irregularity_id: str, resolved_by: str, resolution_notes: Optional[str] = None):
    """Mark a fare irregularity as resolved with detailed resolution notes"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Get current status for history
        current = supabase.table('fare_irregularities').select('*').eq('id', irregularity_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        old_status = current.data[0].get('status')
        
        result = supabase.table('fare_irregularities').update({
            'resolved': True,
            'resolved_by': resolved_by,
            'resolved_at': now,
            'status': 'resolved',
            'resolution_notes': resolution_notes,
            'last_updated_at': now
        }).eq('id', irregularity_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        # Create history entry
        history_data = {
            'irregularity_id': irregularity_id,
            'changed_by': resolved_by,
            'changed_at': now,
            'old_status': old_status,
            'new_status': 'resolved',
            'change_type': 'resolved',
            'notes': f"Resolved by {resolved_by}. Notes: {resolution_notes or 'No notes provided'}"
        }
        supabase.table('irregularity_history').insert(history_data).execute()
        
        return {
            "status": "success",
            "message": "Irregularity resolved",
            "resolved_at": now,
            "resolution_notes": resolution_notes
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign/{irregularity_id}")
async def assign_irregularity(irregularity_id: str, assigned_to: str, assigned_by: str, notes: Optional[str] = None):
    """Assign an irregularity to a specific user for investigation"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Get current status
        current = supabase.table('fare_irregularities').select('*').eq('id', irregularity_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        old_status = current.data[0].get('status')
        old_assigned = current.data[0].get('assigned_to')
        
        result = supabase.table('fare_irregularities').update({
            'assigned_to': assigned_to,
            'assigned_by': assigned_by,
            'assigned_at': now,
            'status': 'investigating',
            'last_updated_at': now
        }).eq('id', irregularity_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        # Create history entry
        history_data = {
            'irregularity_id': irregularity_id,
            'changed_by': assigned_by,
            'changed_at': now,
            'old_status': old_status,
            'new_status': 'investigating',
            'change_type': 'assigned',
            'notes': f"Assigned to {assigned_to} by {assigned_by}. Previous assignee: {old_assigned}. Notes: {notes or 'No notes'}"
        }
        supabase.table('irregularity_history').insert(history_data).execute()
        
        return {
            "status": "success",
            "message": f"Irregularity assigned to {assigned_to}",
            "assigned_at": now,
            "assigned_to": assigned_to
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/escalate/{irregularity_id}")
async def escalate_irregularity(irregularity_id: str, escalated_by: str, reason: str, target_level: int = 1):
    """Escalate an irregularity to a higher authority level"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Get current status
        current = supabase.table('fare_irregularities').select('*').eq('id', irregularity_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        old_level = current.data[0].get('escalation_level', 0)
        old_status = current.data[0].get('status')
        
        if target_level <= old_level:
            raise HTTPException(status_code=400, detail="Target escalation level must be higher than current level")
        
        # Determine new status based on escalation level
        status_map = {
            1: 'escalated',
            2: 'escalated',
            3: 'escalated',
            4: 'critical'
        }
        new_status = status_map.get(target_level, 'escalated')
        
        result = supabase.table('fare_irregularities').update({
            'escalation_level': target_level,
            'last_escalated_at': now,
            'status': new_status,
            'investigation_notes': reason,
            'last_updated_at': now
        }).eq('id', irregularity_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        # Create history entry
        history_data = {
            'irregularity_id': irregularity_id,
            'changed_by': escalated_by,
            'changed_at': now,
            'old_status': old_status,
            'new_status': new_status,
            'change_type': 'escalated',
            'notes': f"Escalated from level {old_level} to {target_level} by {escalated_by}. Reason: {reason}"
        }
        supabase.table('irregularity_history').insert(history_data).execute()
        
        return {
            "status": "success",
            "message": f"Irregularity escalated to level {target_level}",
            "escalated_at": now,
            "escalation_level": target_level,
            "reason": reason
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notes/{irregularity_id}")
async def add_irregularity_note(irregularity_id: str, added_by: str, notes: str, note_type: str = 'investigation'):
    """Add investigation or resolution notes to an irregularity"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Get current status
        current = supabase.table('fare_irregularities').select('*').eq('id', irregularity_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        # Update appropriate notes field
        update_data = {'last_updated_at': now}
        if note_type == 'investigation':
            existing_notes = current.data[0].get('investigation_notes', '')
            update_data['investigation_notes'] = f"{existing_notes}\n\n[{now}] {added_by}: {notes}" if existing_notes else f"[{now}] {added_by}: {notes}"
        elif note_type == 'resolution':
            existing_notes = current.data[0].get('resolution_notes', '')
            update_data['resolution_notes'] = f"{existing_notes}\n\n[{now}] {added_by}: {notes}" if existing_notes else f"[{now}] {added_by}: {notes}"
        
        result = supabase.table('fare_irregularities').update(update_data).eq('id', irregularity_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        # Create history entry
        history_data = {
            'irregularity_id': irregularity_id,
            'changed_by': added_by,
            'changed_at': now,
            'change_type': 'note_added',
            'notes': f"{note_type.capitalize()} note added by {added_by}: {notes}"
        }
        supabase.table('irregularity_history').insert(history_data).execute()
        
        return {
            "status": "success",
            "message": f"{note_type.capitalize()} note added",
            "added_at": now
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{irregularity_id}")
async def get_irregularity_history(irregularity_id: str):
    """Get full history of changes for an irregularity"""
    try:
        result = supabase.table('irregularity_history').select('*').eq('irregularity_id', irregularity_id).order('changed_at', desc=True).execute()
        
        if not result.data:
            return {"irregularity_id": irregularity_id, "history": []}
        
        return {
            "irregularity_id": irregularity_id,
            "history": result.data,
            "total_changes": len(result.data)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/details/{irregularity_id}")
async def get_irregularity_details(irregularity_id: str):
    """Get complete details of an irregularity including history and attachments"""
    try:
        # Get irregularity
        irregularity_result = supabase.table('fare_irregularities').select('*').eq('id', irregularity_id).execute()
        if not irregularity_result.data:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        irregularity = irregularity_result.data[0]
        
        # Get history
        history_result = supabase.table('irregularity_history').select('*').eq('irregularity_id', irregularity_id).order('changed_at', desc=True).execute()
        
        # Get attachments
        attachments_result = supabase.table('irregularity_attachments').select('*').eq('irregularity_id', irregularity_id).order('uploaded_at', desc=True).execute()
        
        # Get trip details
        trip_id = irregularity.get('trip_id')
        trip_result = supabase.table('trips').select('id, buses(plate_number), started_at').eq('id', trip_id).execute()
        
        return {
            "irregularity": irregularity,
            "history": history_result.data if history_result.data else [],
            "attachments": attachments_result.data if attachments_result.data else [],
            "trip": trip_result.data[0] if trip_result.data else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_irregularities(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    anomaly_type: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List irregularities with filtering options"""
    try:
        query = supabase.table('fare_irregularities').select('*')
        
        if status:
            query = query.eq('status', status)
        if severity:
            query = query.eq('severity', severity)
        if anomaly_type:
            query = query.eq('anomaly_type', anomaly_type)
        if assigned_to:
            query = query.eq('assigned_to', assigned_to)
        
        result = query.order('detected_at', desc=True).range(offset, offset + limit - 1).execute()
        
        total_count = len(result.data) if result.data else 0
        
        return {
            "irregularities": result.data if result.data else [],
            "total_count": total_count,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
