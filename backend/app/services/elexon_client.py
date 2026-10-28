import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


class ElexonClientError(Exception):
    """Raised when Elexon BMRS API returns an unrecoverable error."""


class ElexonClient:
    """Asynchronous HTTP client for Elexon BMRS FUELHH and WINDFOR dataset streams."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ELEXON_BASE_URL).rstrip("/")
        self.timeout = settings.HTTP_TIMEOUT_SECONDS
        self.max_retries = settings.HTTP_MAX_RETRIES
        self.backoff = settings.HTTP_RETRY_BACKOFF_SECONDS

    async def _get_json(self, path: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        url = f"{self.base_url}{path}"
        last_exc: Optional[Exception] = None

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers={"Accept": "application/json", "User-Agent": "WINDLINE-Energy-Intelligence/1.0"},
        ) as client:
            for attempt in range(1, self.max_retries + 1):
                try:
                    response = await client.get(url, params=params)
                    if response.status_code == 429:
                        wait_time = self.backoff * (2 ** attempt)
                        logger.warning("Elexon rate limit (429) on %s. Backing off %.1fs", url, wait_time)
                        await asyncio.sleep(wait_time)
                        continue
                    response.raise_for_status()
                    data = response.json()
                    if isinstance(data, dict) and "data" in data:
                        return list(data["data"])
                    if isinstance(data, list):
                        return data
                    raise ElexonClientError(f"Unexpected payload format from Elexon {url}")
                except (httpx.HTTPError, ValueError) as exc:
                    last_exc = exc
                    logger.warning(
                        "Elexon request attempt %d/%d failed for %s (%s): %s",
                        attempt,
                        self.max_retries,
                        url,
                        params,
                        exc,
                    )
                    if attempt < self.max_retries:
                        await asyncio.sleep(self.backoff * attempt)

        raise ElexonClientError(
            f"Failed to fetch Elexon endpoint {url} after {self.max_retries} attempts: {last_exc}"
        )

    async def fetch_fuelhh_wind(
        self,
        settlement_date_from: str,
        settlement_date_to: str,
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetches FUELHH half-hourly actual generation records filtered to fuelType=WIND.
        Uses 10-day settlementDate chunks for reliable stream response sizes.
        """
        start_dt = datetime.strptime(settlement_date_from, "%Y-%m-%d").date()
        end_dt = datetime.strptime(settlement_date_to, "%Y-%m-%d").date()

        chunks = []
        cursor = start_dt
        while cursor <= end_dt:
            chunk_end = min(cursor + timedelta(days=10), end_dt)
            chunks.append((cursor.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
            cursor = chunk_end + timedelta(days=1)

        all_records: List[Dict[str, Any]] = []
        for idx, (c_from, c_to) in enumerate(chunks):
            if progress_callback:
                pct = 5.0 + (idx / max(len(chunks), 1)) * 25.0
                progress_callback(f"Fetching Elexon FUELHH actuals ({c_from} to {c_to})", pct)

            records = await self._get_json(
                settings.FUELHH_STREAM_PATH,
                {
                    "settlementDateFrom": c_from,
                    "settlementDateTo": c_to,
                    "fuelType": "WIND",
                },
            )
            all_records.extend(records)
            await asyncio.sleep(0.15)

        return all_records

    async def fetch_windfor_vintages(
        self,
        publish_from_iso: str,
        publish_to_iso: str,
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetches WINDFOR historical forecast publications across publishDateTime windows.
        Chunks by 4-day publication windows so all historical vintages are retrieved cleanly.
        """
        start_dt = datetime.fromisoformat(publish_from_iso.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )
        end_dt = datetime.fromisoformat(publish_to_iso.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )

        chunks = []
        cursor = start_dt
        while cursor < end_dt:
            chunk_end = min(cursor + timedelta(days=4), end_dt)
            chunks.append(
                (
                    cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
            )
            cursor = chunk_end + timedelta(seconds=1)

        all_records: List[Dict[str, Any]] = []
        for idx, (p_from, p_to) in enumerate(chunks):
            if progress_callback:
                pct = 35.0 + (idx / max(len(chunks), 1)) * 45.0
                progress_callback(
                    f"Fetching Elexon WINDFOR vintages ({p_from[:10]} to {p_to[:10]})", pct
                )

            records = await self._get_json(
                settings.WINDFOR_STREAM_PATH,
                {
                    "publishDateTimeFrom": p_from,
                    "publishDateTimeTo": p_to,
                },
            )
            all_records.extend(records)
            await asyncio.sleep(0.15)

        return all_records


elexon_client = ElexonClient()
