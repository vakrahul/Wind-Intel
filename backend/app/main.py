from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.api import data_quality, forecasts, health, ingestion, metrics, predictive
from app.config import settings
from app.services.cache_service import cache_service
from app.services.ingestion_service import ingestion_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("windline")


@asynccontextmanager
async def lifespan(app: FastAPI):
    counts = cache_service.get_counts()
    if counts["actuals_hourly_jan2026_valid"] < 700 or counts["forecasts_vintages_total"] == 0:
        logger.info("Local January 2026 cache incomplete. Triggering initial Elexon BMRS ingestion...")
        try:
            await ingestion_service.run_ingestion(force_refresh=False)
            logger.info("Initial Elexon BMRS ingestion completed successfully.")
        except Exception as exc:
            logger.warning("Startup ingestion deferred or encountered error: %s", exc)
    else:
        logger.info(
            "Verified cached January 2026 Elexon dataset (%d valid hours, %d forecast vintages).",
            counts["actuals_hourly_jan2026_valid"],
            counts["forecasts_vintages_total"],
        )
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Production-grade UK day-ahead wind forecast intelligence, historical vintage selection, "
        "accuracy evaluation, and chronological backtesting API powered by official Elexon BMRS datasets."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingestion.router)
app.include_router(forecasts.router)
app.include_router(metrics.router)
app.include_router(predictive.router)
app.include_router(data_quality.router)

STATIC_DIR = Path(os.getenv("WINDLINE_STATIC_DIR", "/app/static"))
if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/windline-mark.svg")
    def serve_logo():
        logo_path = STATIC_DIR / "windline-mark.svg"
        if logo_path.exists():
            return FileResponse(str(logo_path), media_type="image/svg+xml")
        return {"status": "not_found"}

    @app.get("/")
    def serve_spa_root():
        return FileResponse(str(STATIC_DIR / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa_fallback(full_path: str):
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    @app.get("/")
    def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "health": "/api/health",
        }
