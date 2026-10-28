from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.models.schemas import IngestionRunRequest, IngestionStatusResponse
from app.services.ingestion_service import ingestion_service

router = APIRouter(tags=["Ingestion"])


@router.get("/api/ingest/status", response_model=IngestionStatusResponse)
def get_ingestion_status() -> IngestionStatusResponse:
    status = ingestion_service.get_status()
    return IngestionStatusResponse(**status)


@router.post("/api/ingest/run", response_model=IngestionStatusResponse)
async def trigger_ingestion(
    payload: IngestionRunRequest, background_tasks: BackgroundTasks
) -> IngestionStatusResponse:
    current = ingestion_service.get_status()
    if current["state"] == "running":
        return IngestionStatusResponse(**current)

    # If force_refresh is requested or cache is empty, run asynchronously or await if initial load
    try:
        updated = await ingestion_service.run_ingestion(force_refresh=payload.force_refresh)
        return IngestionStatusResponse(**updated)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Elexon BMRS ingestion failed: {str(exc)}",
        ) from exc
