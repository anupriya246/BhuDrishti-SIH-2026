"""
BhuSanket - Flask API
Serves the trained landslide risk ML model over HTTP.

Endpoints:
  GET  /health          - liveness check
  POST /predict         - single-location risk prediction
  POST /forecast        - 24-hour lead-time early warning
  GET  /region-risks    - real-time risk data for all NER districts (for map)

Run:
  pip install flask flask-cors joblib pandas scikit-learn requests
  python app.py
"""

import sys
import os
# Add both ml/ (for preprocess) and ml/api/ (for forecast_alert) to path
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, '..'))  # ml/
sys.path.insert(0, _HERE)                       # ml/api/

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from forecast_alert import fetch_hourly_rainfall
from forecast_alert import predict_lead_time_alert
from datetime import datetime, timezone
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # allow all origins 

# ── Load model on startup ──────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent.parent / 'models'

try:
    MODEL    = joblib.load(MODELS_DIR / 'landslide_model.pkl')
    SCALER   = joblib.load(MODELS_DIR / 'scaler.pkl')
    META     = joblib.load(MODELS_DIR / 'model_metadata.pkl')
    FEATURES = META['features']
    print(f"✓ Model loaded: {META['model_name']} | Accuracy: {META['test_accuracy']}")
except FileNotFoundError:
    print("⚠  Model not found. Run `python train.py` first.")
    MODEL = SCALER = META = None
    FEATURES = []

LABEL_MAP = {0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Critical'}

# NER districts with approximate centroids for the map mock data
NER_DISTRICTS = [
    {"name": "Tawang",       "lat": 27.5859, "lon": 91.8598},
    {"name": "Itanagar",     "lat": 27.0844, "lon": 93.6053},
    {"name": "Dibrugarh",    "lat": 27.4728, "lon": 94.9120},
    {"name": "Cherrapunji",  "lat": 25.2500, "lon": 91.7333},
    {"name": "Shillong",     "lat": 25.5788, "lon": 91.8933},
    {"name": "Imphal",       "lat": 24.8170, "lon": 93.9368},
    {"name": "Kohima",       "lat": 25.6700, "lon": 94.1100},
    {"name": "Aizawl",       "lat": 23.7271, "lon": 92.7176},
    {"name": "Agartala",     "lat": 23.8315, "lon": 91.2868},
    {"name": "Gangtok",      "lat": 27.3389, "lon": 88.6065},
    {"name": "Silchar",      "lat": 24.8333, "lon": 92.7789},
    {"name": "Jorhat",       "lat": 26.7509, "lon": 94.2037},
]
color_map = {
        'Low':      '#2ecc71',
        'Moderate': '#f39c12',
        'High':     '#e74c3c',
        'Critical': '#8e44ad',
    }

DISTRICT_PROFILES = [
        {"name": "Tawang",      "lat": 27.5859, "lon": 91.8598, "slope": 48, "elevation": 3048, "curvature": 2.2, "aspect": 210, "precipitation": 178, "ndvi": 0.45, "soil_moisture": 0.55, "soil_type": 2, "lulc": 0, "dist_road": 800,  "dist_fault": 6000},
        {"name": "Itanagar",    "lat": 27.0844, "lon": 93.6053, "slope": 32, "elevation": 350,  "curvature": 1.4, "aspect": 185, "precipitation": 98,  "ndvi": 0.55, "soil_moisture": 0.45, "soil_type": 1, "lulc": 3, "dist_road": 200,  "dist_fault": 9000},
        {"name": "Dibrugarh",   "lat": 27.4728, "lon": 94.9120, "slope": 12, "elevation": 108,  "curvature": 0.5, "aspect": 90,  "precipitation": 45,  "ndvi": 0.65, "soil_moisture": 0.35, "soil_type": 1, "lulc": 1, "dist_road": 150,  "dist_fault": 14000},
        {"name": "Cherrapunji", "lat": 25.2500, "lon": 91.7333, "slope": 54, "elevation": 1313, "curvature": 3.1, "aspect": 225, "precipitation": 312, "ndvi": 0.20, "soil_moisture": 0.72, "soil_type": 2, "lulc": 1, "dist_road": 400,  "dist_fault": 3000},
        {"name": "Shillong",    "lat": 25.5788, "lon": 91.8933, "slope": 28, "elevation": 1496, "curvature": 1.2, "aspect": 170, "precipitation": 87,  "ndvi": 0.50, "soil_moisture": 0.42, "soil_type": 1, "lulc": 3, "dist_road": 100,  "dist_fault": 7500},
        {"name": "Imphal",      "lat": 24.8170, "lon": 93.9368, "slope": 25, "elevation": 786,  "curvature": 1.0, "aspect": 160, "precipitation": 74,  "ndvi": 0.55, "soil_moisture": 0.40, "soil_type": 1, "lulc": 1, "dist_road": 180,  "dist_fault": 10000},
        {"name": "Kohima",      "lat": 25.6700, "lon": 94.1100, "slope": 41, "elevation": 1444, "curvature": 2.0, "aspect": 200, "precipitation": 145, "ndvi": 0.40, "soil_moisture": 0.58, "soil_type": 2, "lulc": 0, "dist_road": 350,  "dist_fault": 5000},
        {"name": "Aizawl",      "lat": 23.7271, "lon": 92.7176, "slope": 36, "elevation": 1132, "curvature": 1.8, "aspect": 195, "precipitation": 92,  "ndvi": 0.42, "soil_moisture": 0.50, "soil_type": 2, "lulc": 0, "dist_road": 300,  "dist_fault": 6500},
        {"name": "Agartala",    "lat": 23.8315, "lon": 91.2868, "slope": 9,  "elevation": 15,   "curvature": 0.3, "aspect": 95,  "precipitation": 38,  "ndvi": 0.60, "soil_moisture": 0.30, "soil_type": 0, "lulc": 1, "dist_road": 80,   "dist_fault": 18000},
        {"name": "Gangtok",     "lat": 27.3389, "lon": 88.6065, "slope": 45, "elevation": 1650, "curvature": 2.5, "aspect": 215, "precipitation": 134, "ndvi": 0.38, "soil_moisture": 0.60, "soil_type": 2, "lulc": 0, "dist_road": 500,  "dist_fault": 4000},
        {"name": "Silchar",     "lat": 24.8333, "lon": 92.7789, "slope": 14, "elevation": 23,   "curvature": 0.6, "aspect": 100, "precipitation": 42,  "ndvi": 0.58, "soil_moisture": 0.33, "soil_type": 0, "lulc": 1, "dist_road": 120,  "dist_fault": 16000},
        {"name": "Jorhat",      "lat": 26.7509, "lon": 94.2037, "slope": 18, "elevation": 87,   "curvature": 0.7, "aspect": 105, "precipitation": 68,  "ndvi": 0.62, "soil_moisture": 0.38, "soil_type": 1, "lulc": 1, "dist_road": 160,  "dist_fault": 12000},
    ]


# ── Live rainfall helper ───────────────────────────────────────────────────────

# Per-district rainfall cache: keyed by (lat, lon), stores {precipitation, soil_moisture, ts}
_RAINFALL_CACHE: dict = {}
_RAINFALL_TTL: int = 1800  # 30 minutes — matches forecast_alert.py cache TTL


def fetch_live_rainfall(lat: float, lon: float) -> dict:
    """
    Returns the current hour's precipitation (mm) and soil moisture (0-1)
    from Open-Meteo for the given lat/lon.

    Uses a 30-minute in-memory cache so repeated calls within half an hour
    are free. Falls back to None if API is unavailable; caller keeps static value.
    """
    cache_key = (round(lat, 3), round(lon, 3))
    cached = _RAINFALL_CACHE.get(cache_key)
    if cached and time.time() - cached["ts"] < _RAINFALL_TTL:
        return {"precipitation": cached["precipitation"], "soil_moisture": cached["soil_moisture"]}

    try:
        hourly = fetch_hourly_rainfall(lat, lon)
        current = hourly[0] if hourly else {}
        precipitation = float(current.get("precipitation", 0.0))
        soil_moisture = float(current.get("soil_moisture", 0.3))
    except Exception as exc:
        print(f"[fetch_live_rainfall] Open-Meteo unavailable for ({lat},{lon}): {exc}")
        return None

    _RAINFALL_CACHE[cache_key] = {
        "precipitation": precipitation,
        "soil_moisture":  soil_moisture,
        "ts":             time.time(),
    }
    return {"precipitation": precipitation, "soil_moisture": soil_moisture}


def prefetch_all_districts(profiles: list, max_workers: int = 6, timeout_sec: float = 20.0) -> dict:
    """
    Fetch live rainfall for all districts in parallel.
    Returns a dict keyed by (lat, lon) → {precipitation, soil_moisture} or None.
    Completes within timeout_sec regardless of slow/failed individual requests.
    """
    results = {}
    def _fetch(d):
        key = (round(d['lat'], 3), round(d['lon'], 3))
        return key, fetch_live_rainfall(d['lat'], d['lon'])

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(_fetch, d): d for d in profiles}
        try:
            for future in as_completed(futures, timeout=timeout_sec):
                try:
                    key, val = future.result()
                    results[key] = val
                except Exception:
                    pass
        except FuturesTimeout:
            print("[prefetch_all_districts] Timeout — using cached/fallback values for remaining districts")

    return results


# ── Helpers ────────────────────────────────────────────────────────────────────

def preprocess_input(body: dict) -> np.ndarray:
    """Convert incoming JSON body to scaled feature vector."""
    row = dict(body)

    # Compute engineered features
    slope = row.get('slope', 30)
    row['rain_slope_interaction'] = row.get('precipitation', 50) * slope / 100
    row['moisture_clay_risk']     = row.get('soil_moisture', 0.4) * (1 if row.get('soil_type', 1) == 2 else 0)
    row['fault_proximity']        = 1 - (row.get('dist_fault', 5000) / 20000)

    X = pd.DataFrame([{f: row.get(f, 0) for f in FEATURES}])
    return SCALER.transform(X)


def model_not_ready():
    return jsonify({"error": "Model not loaded. Run `python train.py` first."}), 503


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status":       "ok",
        "model":        META['model_name'] if META else None,
        "accuracy":     META['test_accuracy'] if META else None,
        "features":     FEATURES,
    })


@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    """
    Single-location risk prediction.

    Request body (JSON):
    {
      "slope": 42,
      "elevation": 1200,
      "curvature": 2.1,
      "aspect": 180,
      "precipitation": 120,
      "ndvi": 0.15,
      "soil_moisture": 0.65,
      "soil_type": 2,
      "lulc": 1,
      "dist_road": 300,
      "dist_fault": 4000
    }
    """
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if MODEL is None:
        return model_not_ready()

    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    try:
        X     = preprocess_input(body)
        pred  = int(MODEL.predict(X)[0])
        proba = MODEL.predict_proba(X)[0]
        probs = {LABEL_MAP[i]: round(float(p), 3) for i, p in enumerate(proba)}

        return jsonify({
            "risk_label":    pred,
            "risk_category": LABEL_MAP[pred],
            "probabilities": probs,
            "confidence":    round(float(max(proba)), 3),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/forecast', methods=['POST', 'OPTIONS'])
def forecast():
    """
    24-hour lead-time early warning.

    Request body (JSON):
    {
      "latitude": 25.25,
      "longitude": 91.73,
      "static_features": { "slope": 42, "elevation": 1150, ... },
      "alert_threshold": "high"
    }
    """
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    if MODEL is None:
        return model_not_ready()

    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    missing = [f for f in ['latitude', 'longitude', 'static_features'] if f not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        result = predict_lead_time_alert(
            MODEL, FEATURES,
            body['latitude'], body['longitude'],
            body['static_features'],
            alert_threshold=body.get('alert_threshold', 'high'),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Forecast failed: {str(e)}"}), 502


@app.route('/region-risks', methods=['GET'])
def region_risks():
    """
    Returns risk data for all NER districts by running the trained model
    with representative terrain + LIVE rainfall fetched from Open-Meteo
    for each district's lat/lon. Falls back to static profile precipitation
    if Open-Meteo is unreachable.
    """

    regions = []
    # Fetch live rainfall for all districts in parallel (max 20s total)
    live_map = prefetch_all_districts(DISTRICT_PROFILES)

    for d in DISTRICT_PROFILES:
        # Build profile from static terrain features (slope, elevation, etc.)
        profile = {k: v for k, v in d.items() if k not in ('name', 'lat', 'lon')}

        # ── Inject live rainfall & soil moisture ──────────────────────────────
        live = live_map.get((round(d['lat'], 3), round(d['lon'], 3)))
        if live is not None:
            profile['precipitation'] = live['precipitation']
            profile['soil_moisture'] = live['soil_moisture']
            live_data = True
        else:
            live_data = False
        # ─────────────────────────────────────────────────────────────────────

        if MODEL is not None:
            try:
                X = preprocess_input(profile)
                label_idx = int(MODEL.predict(X)[0])
                label = LABEL_MAP[label_idx]

                confidence = None
                if hasattr(MODEL, 'predict_proba'):
                    probabilities = MODEL.predict_proba(X)[0]
                    confidence = round(float(max(probabilities)), 3)

            except Exception as e:
                print(f"Prediction error for {d['name']}: {e}")
                label_idx = 1
                label = 'Moderate'
                confidence = None
        else:
            score = (
                (d['slope'] / 75) * 0.4
                + (profile['precipitation'] / 400) * 0.4
                + profile['soil_moisture'] * 0.2
            )

            label_idx = (
                3 if score > 0.75
                else 2 if score > 0.50
                else 1 if score > 0.25
                else 0
            )

            label = LABEL_MAP[label_idx]
            confidence = None

        regions.append({
            "name":          d['name'],
            "lat":           d['lat'],
            "lon":           d['lon'],
            "risk_label":    label_idx,
            "risk_category": label,
            "confidence":    confidence,
            "color":         color_map[label],
            "rainfall_mm":   round(profile['precipitation'], 1),
            "slope_avg":     d['slope'],
            "soil_moisture": round(profile['soil_moisture'], 3),
            "elevation":     d['elevation'],
            "live_data":     live_data,
        })

    return jsonify({
        "regions":     regions,
        "model":       "Gradient Boosting" if MODEL is not None else "Fallback Heuristic",
        "total":       len(regions),
        "data_source": "Open-Meteo (live)" if any(r["live_data"] for r in regions) else "Static profile (fallback)",
        "fetched_at":  datetime.now(timezone.utc).isoformat(),
        })


@app.route('/weather', methods=['GET'])
def weather():
    """
    Returns the current-hour live precipitation (mm) and soil_moisture (0-1)
    for a given district via Open-Meteo.  Also returns the full static terrain
    profile so the frontend can populate all AI Risk Assessment fields at once.

    Query params:
      district  — district name (must match DISTRICT_PROFILES)
      lat       — latitude  (used when district not found, optional)
      lon       — longitude (used when district not found, optional)

    Response:
    {
      "district": "Cherrapunji",
      "lat": 25.25, "lon": 91.73,
      "precipitation": 14.2,
      "soil_moisture": 0.68,
      "slope": 54, "elevation": 1313, "curvature": 3.1, "aspect": 225,
      "ndvi": 0.20, "soil_type": 2, "lulc": 1,
      "dist_road": 400, "dist_fault": 3000,
      "live_data": true,
      "fetched_at": "2026-09-29T..."
    }
    """
    district_name = request.args.get('district', '').strip()
    try:
        lat = float(request.args.get('lat', 0))
        lon = float(request.args.get('lon', 0))
    except (ValueError, TypeError):
        lat = lon = 0.0

    # Find the matching profile (case-insensitive)
    profile = next(
        (d for d in DISTRICT_PROFILES
         if d['name'].lower() == district_name.lower()),
        None
    )

    if profile is None and lat and lon:
        # No named match but coordinates provided — build a minimal profile
        profile = {
            'name': district_name or 'Unknown',
            'lat': lat, 'lon': lon,
            'slope': 30, 'elevation': 500, 'curvature': 1.5, 'aspect': 180,
            'ndvi': 0.40, 'soil_type': 1, 'lulc': 0,
            'dist_road': 500, 'dist_fault': 8000,
        }

    if profile is None:
        return jsonify({
            "error": f"District '{district_name}' not found. "
                     f"Available: {[d['name'] for d in DISTRICT_PROFILES]}"
        }), 404

    use_lat = profile['lat']
    use_lon = profile['lon']

    # Fetch live rainfall — reuses the same function used by /region-risks
    live = fetch_live_rainfall(use_lat, use_lon)

    if live is not None:
        precipitation = live['precipitation']
        soil_moisture = live['soil_moisture']
        live_data = True
    else:
        # API unavailable — return static profile values, clearly flagged
        precipitation = profile.get('precipitation', 0.0)
        soil_moisture = profile.get('soil_moisture', 0.3)
        live_data = False

    return jsonify({
        "district":     profile['name'],
        "lat":          use_lat,
        "lon":          use_lon,
        # Live / fallback met values
        "precipitation": round(precipitation, 2),
        "soil_moisture": round(soil_moisture, 3),
        # Static terrain values from DISTRICT_PROFILES
        "slope":        profile['slope'],
        "elevation":    profile['elevation'],
        "curvature":    profile['curvature'],
        "aspect":       profile['aspect'],
        "ndvi":         profile['ndvi'],
        "soil_type":    profile['soil_type'],
        "lulc":         profile['lulc'],
        "dist_road":    profile['dist_road'],
        "dist_fault":   profile['dist_fault'],
        # Metadata
        "live_data":    live_data,
        "fetched_at":   datetime.now(timezone.utc).isoformat(),
    })


@app.route('/stats', methods=['GET'])
def stats():
    """
    Calculate dashboard statistics from the same ML predictions
    used by /region-risks, using live rainfall from Open-Meteo.
    """

    risk_counts = {
        'Low': 0,
        'Moderate': 0,
        'High': 0,
        'Critical': 0
    }

    # Fetch live rainfall for all districts in parallel (max 20s total)
    live_map = prefetch_all_districts(DISTRICT_PROFILES)

    for d in DISTRICT_PROFILES:

        profile = {
            k: v for k, v in d.items()
            if k not in ('name', 'lat', 'lon')
        }

        # Inject live rainfall if available
        live = live_map.get((round(d['lat'], 3), round(d['lon'], 3)))
        if live is not None:
            profile['precipitation'] = live['precipitation']
            profile['soil_moisture'] = live['soil_moisture']
        try:

            if MODEL is not None:

                X = preprocess_input(profile)
                label_idx = int(MODEL.predict(X)[0])
                label = LABEL_MAP[label_idx]

            else:

                score = (
                    (d['slope'] / 75) * 0.4
                    + (d['precipitation'] / 400) * 0.4
                    + d['soil_moisture'] * 0.2
                )

                label_idx = (
                    3 if score > 0.75
                    else 2 if score > 0.50
                    else 1 if score > 0.25
                    else 0
                )

                label = LABEL_MAP[label_idx]

            risk_counts[label] += 1

        except Exception as e:

            print(
                f"Stats prediction error for {d['name']}: {e}"
            )

            risk_counts['Moderate'] += 1

    return jsonify({

        "total_monitored_zones": len(DISTRICT_PROFILES),

        "active_alerts": (
            risk_counts['High']
            + risk_counts['Critical']
        ),

        "critical_zones": risk_counts['Critical'],

        "high_zones": risk_counts['High'],

        "moderate_zones": risk_counts['Moderate'],

        "low_zones": risk_counts['Low'],

        "risk_distribution": risk_counts,

        "last_updated": datetime.now(timezone.utc).isoformat(),

        "model": (
            "Gradient Boosting"
            if MODEL is not None
            else "Fallback Heuristic"
        )
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
