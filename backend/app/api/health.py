from fastapi import APIRouter
from app.config import settings
from app.models.schemas import HealthResponse
from app.services.cache_service import cache_service

router = APIRouter(tags=["Health"])


@router.get("/api/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    counts = cache_service.get_counts()
    meta = cache_service.get_metadata("last_ingestion_audit") or {}
    jan_ready = counts["actuals_hourly_jan2026_valid"] >= 700 and counts["forecasts_vintages_total"] > 0
    return HealthResponse(
        status="ok",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        database_ready=True,
        january_2026_ready=jan_ready,
        cached_hourly_actuals_jan2026=counts["actuals_hourly_jan2026_valid"],
        cached_forecast_vintages=counts["forecasts_vintages_total"],
        last_ingestion_utc=meta.get("completed_at_utc"),
        evaluation_scope=f"{settings.EVALUATION_START_DATE} to {settings.EVALUATION_END_DATE}",
        display_timezone=settings.DISPLAY_TIMEZONE,
    )
