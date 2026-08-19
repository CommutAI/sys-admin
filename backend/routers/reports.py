"""
Report generation endpoints - complex data processing
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from database import supabase

router = APIRouter()


class ReportRequest(BaseModel):
    """Report generation request"""
    report_type: str
    start_date: date
    end_date: date
    filters: Optional[dict] = None


class GeneratedReport(BaseModel):
    """Generated report model"""
    report_type: str
    period: dict
    generated_at: datetime
    data: dict
    summary: dict


@router.post("/generate")
async def generate_report(request: ReportRequest) -> GeneratedReport:
    """
    Generate various types of reports
    Handles complex data processing server-side
    """
    try:
        start_iso = request.start_date.isoformat()
        end_iso = (request.end_date + timedelta(days=1)).isoformat()
        
        report_data = {}
        summary = {}
        
        if request.report_type == "daily_revenue":
            # Revenue report
            tx_result = supabase.table('transactions').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
            transactions = tx_result[1] if tx_result[1] else []
            
            total_revenue = sum(t['amount'] for t in transactions) if transactions else 0
            by_type = {}
            for t in transactions:
                tx_type = t['type']
                if tx_type not in by_type:
                    by_type[tx_type] = 0
                by_type[tx_type] += t['amount']
            
            report_data = {
                "transactions": transactions,
                "by_type": by_type
            }
            summary = {
                "total_revenue": total_revenue,
                "transaction_count": len(transactions) if transactions else 0
            }
        
        elif request.report_type == "passenger_statistics":
            # Passenger statistics report
            passenger_result = supabase.table('passenger_counts').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
            passenger_counts = passenger_result[1] if passenger_result[1] else []
            boarded_result = supabase.table('boarded_passengers').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
            boarded = boarded_result[1] if boarded_result[1] else []
            
            total_passengers = sum(p['count'] for p in passenger_counts) if passenger_counts else 0
            unique_passengers = len(set(b['passenger_id'] for b in boarded)) if boarded else 0
            
            report_data = {
                "passenger_counts": passenger_counts,
                "boarded_passengers": boarded
            }
            summary = {
                "total_passenger_count": total_passengers,
                "unique_passengers": unique_passengers,
                "average_per_trip": total_passengers / len(passenger_counts) if passenger_counts else 0
            }
        
        elif request.report_type == "bus_performance":
            # Bus performance report
            trips_result = supabase.table('trips').select('*, buses(*)').gte('created_at', start_iso).lt('created_at', end_iso).execute()
            trips = trips_result[1] if trips_result[1] else []
            
            bus_performance = {}
            for trip in trips:
                bus_id = trip['bus_id']
                bus = trip.get('buses', {})
                plate = bus.get('plate_number', 'Unknown')
                
                if bus_id not in bus_performance:
                    bus_performance[bus_id] = {
                        "plate_number": plate,
                        "trip_count": 0,
                        "total_passengers": 0
                    }
                
                bus_performance[bus_id]["trip_count"] += 1
            
            report_data = {"bus_performance": bus_performance}
            summary = {
                "total_buses": len(bus_performance),
                "total_trips": sum(b["trip_count"] for b in bus_performance.values())
            }
        
        elif request.report_type == "fare_compliance":
            # Fare compliance report
            irregularity_result = supabase.table('fare_irregularities').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
            irregularities = irregularity_result[1] if irregularity_result[1] else []
            
            resolved = len([i for i in irregularities if i.get('resolved')])
            unresolved = len([i for i in irregularities if not i.get('resolved')])
            
            report_data = {"irregularities": irregularities}
            summary = {
                "total_irregularities": len(irregularities) if irregularities else 0,
                "resolved": resolved,
                "unresolved": unresolved,
                "compliance_rate": (resolved / len(irregularities) * 100) if irregularities else 100
            }
        
        else:
            raise HTTPException(status_code=400, detail="Invalid report type")
        
        return GeneratedReport(
            report_type=request.report_type,
            period={"start": start_iso, "end": request.end_date.isoformat()},
            generated_at=datetime.now(),
            data=report_data,
            summary=summary
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scheduled")
async def get_scheduled_reports():
    """Get list of available scheduled reports"""
    return {
        "available_reports": [
            {
                "id": "daily_revenue",
                "name": "Daily Revenue Report",
                "description": "Revenue breakdown by transaction type"
            },
            {
                "id": "passenger_statistics",
                "name": "Passenger Statistics Report",
                "description": "Passenger counts and boarding statistics"
            },
            {
                "id": "bus_performance",
                "name": "Bus Performance Report",
                "description": "Trip counts and performance per bus"
            },
            {
                "id": "fare_compliance",
                "name": "Fare Compliance Report",
                "description": "Fare irregularities and resolution status"
            }
        ]
    }


@router.get("/export/{report_id}")
async def export_report(
    report_id: str,
    start_date: date,
    end_date: date,
    format: str = Query("json", regex="^(json|csv)$")
):
    """
    Export report in specified format
    """
    try:
        request = ReportRequest(
            report_type=report_id,
            start_date=start_date,
            end_date=end_date
        )
        
        report = await generate_report(request)
        
        if format == "json":
            return report
        elif format == "csv":
            # Convert to CSV format (simplified example)
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write summary
            writer.writerow(["Summary"])
            for key, value in report.summary.items():
                writer.writerow([key, value])
            
            writer.writerow([])
            writer.writerow(["Data"])
            
            # Write data based on report type
            if report.report_type == "daily_revenue" and "transactions" in report.data:
                writer.writerow(["Type", "Amount", "Created At"])
                for tx in report.data["transactions"]:
                    writer.writerow([tx.get('type'), tx.get('amount'), tx.get('created_at')])
            
            csv_content = output.getvalue()
            output.close()
            
            from fastapi.responses import Response
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={report_id}_{start_date}_to_{end_date}.csv"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
