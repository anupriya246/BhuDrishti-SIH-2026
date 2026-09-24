"""
BhuSanket - Forecast Alert Module
Fetches 24-hour rainfall forecast from Open-Meteo (free, no API key needed)
and runs the ML model against each hour to find the earliest risk threshold breach.
"""

import requests
import pandas as pd
from datetime import datetime
import time


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
CACHE={}
CACHE_TTL=1800  #30minutes

RISK_ORDER = {"low": 0, "moderate": 1, "high": 2, "critical": 3}


def fetch_hourly_rainfall(lat: float, lon: float) -> list[dict]:
    """
    Calls Open-Meteo API for the next 24 hours of hourly rainfall
    and soil moisture data for a given lat/lon in NER.
    Returns a list of dicts: [{time, precipitation, soil_moisture}, ...]
    """
    cache_key = (round(lat, 3), round(lon, 3))
    cached = CACHE.get(cache_key)

    if cached and time.time() - cached["time"] < CACHE_TTL:
        return cached["data"]
    params = {
        "latitude":              lat,
        "longitude":             lon,
        "hourly":                "precipitation,soil_moisture_0_to_1cm",
        "forecast_days":         1,
        "timezone":              "Asia/Kolkata",
    }
    for attempt in range(3):
        resp = requests.get(
            OPEN_METEO_URL,
            params=params,
            timeout=30,
            headers={"User-Agent": "BhuDrishti-SIH-2026/1.0"}
        )

        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue

        resp.raise_for_status()
        data = resp.json()["hourly"]
        break
    else:
        if cached:
            return cached["data"]

        hourly = []

        for i in range(24):
            hourly.append({
                "time": (datetime.now() + pd.Timedelta(hours=i)).strftime("%Y-%m-%dT%H:00"),
                "precipitation": 0.0,
                "soil_moisture": 0.3,
            })

        return hourly

    hourly = []
    for i, t in enumerate(data["time"]):
        hourly.append({
            "time":          t,
            "precipitation": data["precipitation"][i] or 0.0,
            "soil_moisture": data["soil_moisture_0_to_1cm"][i] or 0.3,
        })
    CACHE[cache_key] = {
    "time": time.time(),
    "data": hourly
    }
    
    return hourly


def predict_lead_time_alert(
    model,
    features: list,
    lat: float,
    lon: float,
    static_features: dict,
    alert_threshold: str = "high",
) -> dict:
    """
    For each of the next 24 hours:
      - Plug the forecasted rainfall + soil_moisture into static_features
      - Run the model
      - Check if predicted risk >= alert_threshold

    Returns a summary dict with when the alert is expected (if at all).
    """
    hourly_data = fetch_hourly_rainfall(lat, lon)
    threshold_rank = RISK_ORDER.get(alert_threshold.lower(), 2)

    full_forecast = []
    alert_hour    = None

    for i, hour in enumerate(hourly_data):
        # Build the feature row for this hour
        row = dict(static_features)
        row["precipitation"] = hour["precipitation"]
        row["soil_moisture"] = hour["soil_moisture"]

        # Engineered features
        slope = row.get("slope", row.get("slope_deg", 30))
        row["rain_slope_interaction"] = row["precipitation"] * slope / 100
        row["moisture_clay_risk"]     = row["soil_moisture"] * (1 if row.get("soil_type", 1) == 2 else 0)
        row["fault_proximity"]        = 1 - (row.get("dist_fault", 5000) / 20000)

        # Filter to expected features only
        input_df = pd.DataFrame([{f: row.get(f, 0) for f in features}])

        pred  = model.predict(input_df)[0]
        proba = model.predict_proba(input_df)[0]
        probs = {int(cls): round(float(p), 3) for cls, p in zip(model.classes_, proba)}

        # Map numeric label to name
        label_map = {0: "low", 1: "moderate", 2: "high", 3: "critical"}
        pred_name = label_map.get(int(pred), str(pred)).lower()

        entry = {
            "hour":           i,
            "time":           hour["time"],
            "precipitation":  hour["precipitation"],
            "predicted_zone": pred_name,
            "probabilities":  probs,
        }
        full_forecast.append(entry)

        # First hour that crosses the threshold
        if alert_hour is None and RISK_ORDER.get(pred_name, 0) >= threshold_rank:
            alert_hour = entry

    if alert_hour:
        return {
            "alert_expected":           True,
            "hours_until_alert":        alert_hour["hour"],
            "alert_time":               alert_hour["time"],
            "predicted_zone_at_alert":  alert_hour["predicted_zone"],
            "probabilities_at_alert":   alert_hour["probabilities"],
            "full_24h_forecast":        full_forecast,
        }
    else:
        return {
            "alert_expected":    False,
            "hours_until_alert": None,
            "alert_time":        None,
            "full_24h_forecast": full_forecast,
        }
