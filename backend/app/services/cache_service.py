import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd
from app.config import settings


class CacheService:
    """SQLite persistence layer for raw metadata, normalized half-hourly/hourly actuals, and forecast vintages."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.SQLITE_DB_PATH
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS actuals_hh (
                    start_time_utc TEXT PRIMARY KEY,
                    publish_time_utc TEXT,
                    settlement_date TEXT,
                    settlement_period INTEGER,
                    fuel_type TEXT,
                    generation_mw REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS actuals_hourly (
                    hour_start_utc TEXT PRIMARY KEY,
                    hh_00_mw REAL,
                    hh_30_mw REAL,
                    actual_hourly_mw REAL,
                    hh_00_publish_utc TEXT,
                    hh_30_publish_utc TEXT,
                    pair_status TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS forecasts_vintages (
                    start_time_utc TEXT NOT NULL,
                    publish_time_utc TEXT NOT NULL,
                    generation_mw REAL NOT NULL,
                    PRIMARY KEY (start_time_utc, publish_time_utc)
                );

                CREATE INDEX IF NOT EXISTS idx_forecasts_start_time
                ON forecasts_vintages (start_time_utc, publish_time_utc);

                CREATE TABLE IF NOT EXISTS ingestion_metadata (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL
                );
                """
            )

    def save_actuals_hh(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
        records = [
            (
                str(row["start_time_utc"]),
                str(row["publish_time_utc"]) if pd.notna(row.get("publish_time_utc")) else None,
                str(row["settlement_date"]) if pd.notna(row.get("settlement_date")) else None,
                int(row["settlement_period"]) if pd.notna(row.get("settlement_period")) else None,
                str(row.get("fuel_type", "WIND")),
                float(row["generation_mw"]),
            )
            for _, row in df.iterrows()
        ]
        with self._get_conn() as conn:
            conn.executemany(
                """
                INSERT OR REPLACE INTO actuals_hh
                (start_time_utc, publish_time_utc, settlement_date, settlement_period, fuel_type, generation_mw)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                records,
            )

    def save_actuals_hourly(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
        records = [
            (
                str(row["hour_start_utc"]),
                float(row["hh_00_mw"]) if pd.notna(row.get("hh_00_mw")) else None,
                float(row["hh_30_mw"]) if pd.notna(row.get("hh_30_mw")) else None,
                float(row["actual_hourly_mw"]) if pd.notna(row.get("actual_hourly_mw")) else None,
                str(row["hh_00_publish_utc"]) if pd.notna(row.get("hh_00_publish_utc")) else None,
                str(row["hh_30_publish_utc"]) if pd.notna(row.get("hh_30_publish_utc")) else None,
                str(row["pair_status"]),
            )
            for _, row in df.iterrows()
        ]
        with self._get_conn() as conn:
            conn.executemany(
                """
                INSERT OR REPLACE INTO actuals_hourly
                (hour_start_utc, hh_00_mw, hh_30_mw, actual_hourly_mw, hh_00_publish_utc, hh_30_publish_utc, pair_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                records,
            )

    def save_forecasts_vintages(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
        records = [
            (
                str(row["start_time_utc"]),
                str(row["publish_time_utc"]),
                float(row["generation_mw"]),
            )
            for _, row in df.iterrows()
        ]
        with self._get_conn() as conn:
            conn.executemany(
                """
                INSERT OR REPLACE INTO forecasts_vintages
                (start_time_utc, publish_time_utc, generation_mw)
                VALUES (?, ?, ?)
                """,
                records,
            )

    def save_metadata(self, key: str, payload: Dict[str, Any]) -> None:
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO ingestion_metadata (key, value_json, updated_at_utc)
                VALUES (?, ?, ?)
                """,
                (key, json.dumps(payload), now_utc),
            )

    def get_metadata(self, key: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT value_json FROM ingestion_metadata WHERE key = ?", (key,)
            ).fetchone()
            if row:
                return json.loads(row["value_json"])
        return None

    def load_actuals_hh(
        self, start_utc: Optional[str] = None, end_utc: Optional[str] = None
    ) -> pd.DataFrame:
        query = "SELECT * FROM actuals_hh WHERE 1=1"
        params: List[Any] = []
        if start_utc:
            query += " AND start_time_utc >= ?"
            params.append(start_utc)
        if end_utc:
            query += " AND start_time_utc <= ?"
            params.append(end_utc)
        query += " ORDER BY start_time_utc ASC"
        with self._get_conn() as conn:
            return pd.read_sql_query(query, conn, params=params)

    def load_actuals_hourly(
        self, start_utc: Optional[str] = None, end_utc: Optional[str] = None
    ) -> pd.DataFrame:
        query = "SELECT * FROM actuals_hourly WHERE 1=1"
        params: List[Any] = []
        if start_utc:
            query += " AND hour_start_utc >= ?"
            params.append(start_utc)
        if end_utc:
            query += " AND hour_start_utc <= ?"
            params.append(end_utc)
        query += " ORDER BY hour_start_utc ASC"
        with self._get_conn() as conn:
            return pd.read_sql_query(query, conn, params=params)

    def load_forecasts_vintages(
        self, start_utc: Optional[str] = None, end_utc: Optional[str] = None
    ) -> pd.DataFrame:
        query = "SELECT * FROM forecasts_vintages WHERE 1=1"
        params: List[Any] = []
        if start_utc:
            query += " AND start_time_utc >= ?"
            params.append(start_utc)
        if end_utc:
            query += " AND start_time_utc <= ?"
            params.append(end_utc)
        query += " ORDER BY start_time_utc ASC, publish_time_utc ASC"
        with self._get_conn() as conn:
            return pd.read_sql_query(query, conn, params=params)

    def get_counts(self) -> Dict[str, int]:
        with self._get_conn() as conn:
            hh_total = conn.execute("SELECT COUNT(*) AS c FROM actuals_hh").fetchone()["c"]
            hh_jan = conn.execute(
                """
                SELECT COUNT(*) AS c FROM actuals_hh
                WHERE start_time_utc >= '2026-01-01T00:00:00Z'
                  AND start_time_utc <= '2026-01-31T23:30:00Z'
                """
            ).fetchone()["c"]
            hh_dec_pre = conn.execute(
                """
                SELECT COUNT(*) AS c FROM actuals_hh
                WHERE start_time_utc < '2026-01-01T00:00:00Z'
                """
            ).fetchone()["c"]
            hourly_total = conn.execute("SELECT COUNT(*) AS c FROM actuals_hourly").fetchone()["c"]
            hourly_jan = conn.execute(
                """
                SELECT COUNT(*) AS c FROM actuals_hourly
                WHERE hour_start_utc >= '2026-01-01T00:00:00Z'
                  AND hour_start_utc <= '2026-01-31T23:00:00Z'
                  AND pair_status = 'valid'
                """
            ).fetchone()["c"]
            vintages_total = conn.execute(
                "SELECT COUNT(*) AS c FROM forecasts_vintages"
            ).fetchone()["c"]
            vintages_jan_target = conn.execute(
                """
                SELECT COUNT(*) AS c FROM forecasts_vintages
                WHERE start_time_utc >= '2026-01-01T00:00:00Z'
                  AND start_time_utc <= '2026-01-31T23:00:00Z'
                """
            ).fetchone()["c"]
            distinct_pub = conn.execute(
                "SELECT COUNT(DISTINCT publish_time_utc) AS c FROM forecasts_vintages"
            ).fetchone()["c"]
        return {
            "actuals_hh_total": int(hh_total),
            "actuals_hh_jan2026": int(hh_jan),
            "actuals_hh_dec2025_preperiod": int(hh_dec_pre),
            "actuals_hourly_total": int(hourly_total),
            "actuals_hourly_jan2026_valid": int(hourly_jan),
            "forecasts_vintages_total": int(vintages_total),
            "forecasts_vintages_jan2026_target": int(vintages_jan_target),
            "distinct_publish_times": int(distinct_pub),
        }

    def save_raw_extract(self, filename: str, data: Any) -> Path:
        out_path = settings.RAW_EXTRACTS_DIR / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return out_path


cache_service = CacheService()
