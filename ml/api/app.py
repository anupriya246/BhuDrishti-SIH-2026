"""
BhuSanket - Flask API
Serves the trained landslide risk ML model over HTTP.

Endpoints:
  GET  /health          - liveness check
  POST /predict         - single-location risk prediction
  POST /forecast        - 24-hour lead-time early warning
  GET  /region-risks    - mock risk data for all NER districts (for map)

Run:
  pip install flask flask-cors joblib pandas scikit-learn requests
  python app.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from forecast_alert import predict_lead_time_alert

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # allow all origins (dashboard on localhost:5173)

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
    Returns mock risk data for all NER districts.
    In production this would run the model for each district using
    real-time sensor + IMD rainfall data.
    """
    np.random.seed(42)
    label_map = {0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Critical'}
    color_map = {
        'Low':      '#2ecc71',
        'Moderate': '#f39c12',
        'High':     '#e74c3c',
        'Critical': '#8e44ad',
    }

    regions = []
    for d in NER_DISTRICTS:
        label_idx = int(np.random.choice([0, 1, 2, 3], p=[0.2, 0.35, 0.30, 0.15]))
        label     = label_map[label_idx]
        regions.append({
            **d,
            "risk_label":    label_idx,
            "risk_category": label,
            "color":         color_map[label],
            "rainfall_mm":   round(float(np.random.uniform(20, 180)), 1),
            "slope_avg":     round(float(np.random.uniform(10, 60)), 1),
        })
    return jsonify({"regions": regions})


@app.route('/stats', methods=['GET'])
def stats():
    """Summary statistics for the dashboard header cards."""
    return jsonify({
        "total_monitored_zones": len(NER_DISTRICTS),
        "active_alerts":         3,
        "critical_zones":        1,
        "high_zones":            2,
        "last_updated":          "2026-09-10T09:30:00+05:30",
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
