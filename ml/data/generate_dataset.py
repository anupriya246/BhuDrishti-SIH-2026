"""
BhuSanket - Synthetic Dataset Generator
Generates a realistic landslide susceptibility dataset for NER (North-East India)
Features based on Mendeley Landslide Susceptibility Dataset variables.
"""

import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)

N_SAMPLES = 5000

def generate_dataset():
    # ── Terrain features ──────────────────────────────────────────────────────
    slope       = np.random.uniform(0, 75, N_SAMPLES)          # degrees
    elevation   = np.random.uniform(100, 3500, N_SAMPLES)      # metres (NER range)
    curvature   = np.random.uniform(-10, 10, N_SAMPLES)        # plan curvature
    aspect      = np.random.uniform(0, 360, N_SAMPLES)         # degrees

    # ── Hydrology & climate ───────────────────────────────────────────────────
    precipitation = np.random.uniform(50, 600, N_SAMPLES)      # mm (daily)
    ndvi          = np.random.uniform(-0.2, 0.9, N_SAMPLES)    # vegetation index
    soil_moisture = np.random.uniform(0, 1, N_SAMPLES)         # 0-1 normalised

    # ── Categorical ───────────────────────────────────────────────────────────
    # Soil types: 0=Sandy, 1=Loamy, 2=Clay, 3=Rocky
    soil_type  = np.random.choice([0, 1, 2, 3], N_SAMPLES, p=[0.2, 0.35, 0.3, 0.15])
    # LULC: 0=Forest, 1=Agriculture, 2=Barren, 3=Urban, 4=Waterbody
    lulc       = np.random.choice([0, 1, 2, 3, 4], N_SAMPLES, p=[0.4, 0.25, 0.15, 0.15, 0.05])

    # ── Distance features ─────────────────────────────────────────────────────
    dist_road   = np.random.uniform(0, 5000, N_SAMPLES)        # metres
    dist_fault  = np.random.uniform(0, 20000, N_SAMPLES)       # metres

    # ── Derived risk score (physics-informed label generation) ────────────────
    risk_score = (
        0.30 * (slope / 75) +
        0.20 * (precipitation / 600) +
        0.15 * (soil_moisture) +
        0.10 * (1 - ndvi) +                        # low vegetation → higher risk
        0.10 * np.where(soil_type == 2, 1.0,       # clay soil → higher risk
                 np.where(soil_type == 1, 0.6, 0.3)) +
        0.08 * np.abs(curvature / 10) +
        0.07 * (1 - dist_fault / 20000)            # closer to fault → riskier
    )

    # Add Gaussian noise
    risk_score += np.random.normal(0, 0.04, N_SAMPLES)
    risk_score = np.clip(risk_score, 0, 1)

    # ── Label encoding ────────────────────────────────────────────────────────
    def to_label(score):
        if score < 0.25:   return 0   # Low
        elif score < 0.50: return 1   # Moderate
        elif score < 0.75: return 2   # High
        else:              return 3   # Critical

    label        = np.array([to_label(s) for s in risk_score])
    label_names  = np.array(['Low', 'Moderate', 'High', 'Critical'])
    label_text   = label_names[label]

    # ── Assemble DataFrame ────────────────────────────────────────────────────
    df = pd.DataFrame({
        'slope':          slope,
        'elevation':      elevation,
        'curvature':      curvature,
        'aspect':         aspect,
        'precipitation':  precipitation,
        'ndvi':           ndvi,
        'soil_moisture':  soil_moisture,
        'soil_type':      soil_type,
        'lulc':           lulc,
        'dist_road':      dist_road,
        'dist_fault':     dist_fault,
        'risk_score':     risk_score,
        'risk_label':     label,
        'risk_category':  label_text,
    })

    out_path = Path(__file__).parent / 'landslide_dataset.csv'
    df.to_csv(out_path, index=False)

    print(f"Dataset saved → {out_path}")
    print(f"Shape : {df.shape}")
    print("\nClass distribution:")
    print(df['risk_category'].value_counts())
    return df


if __name__ == '__main__':
    generate_dataset()
