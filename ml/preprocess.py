"""
BhuSanket - Data Preprocessing Pipeline
Handles loading, cleaning, encoding, scaling, and train/test splitting.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent / 'data'
MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

FEATURE_COLS = [
    'slope', 'elevation', 'curvature', 'aspect',
    'precipitation', 'ndvi', 'soil_moisture',
    'soil_type', 'lulc', 'dist_road', 'dist_fault',
]
TARGET_COL = 'risk_label'

LABEL_MAP = {0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Critical'}


def load_data(csv_path: str | Path = None) -> pd.DataFrame:
    """Load dataset from CSV. Generates synthetic data if file not found."""
    if csv_path is None:
        csv_path = DATA_DIR / 'landslide_dataset.csv'

    if not Path(csv_path).exists():
        print("Dataset not found – generating synthetic dataset...")
        from data.generate_dataset import generate_dataset
        generate_dataset()

    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} records, {df.shape[1]} columns.")
    return df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Drop duplicates, handle missing values, clip outliers."""
    df = df.drop_duplicates().copy()

    # Fill numeric NaNs with median
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    for col in num_cols:
        if df[col].isna().sum() > 0:
            df[col].fillna(df[col].median(), inplace=True)

    # Clip slope to valid range
    df['slope'] = df['slope'].clip(0, 90)
    df['ndvi']  = df['ndvi'].clip(-1, 1)

    print(f"After cleaning: {df.shape}")
    return df


def feature_engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived features that improve model signal."""
    # Rain-slope interaction (key landslide trigger)
    df['rain_slope_interaction'] = df['precipitation'] * df['slope'] / 100

    # Moisture-clay risk (clay retains water → unstable)
    df['moisture_clay_risk'] = df['soil_moisture'] * (df['soil_type'] == 2).astype(int)

    # Fault proximity score (0-1, closer = higher)
    df['fault_proximity'] = 1 - (df['dist_fault'] / df['dist_fault'].max())

    return df


def get_features(df: pd.DataFrame) -> list:
    """Return final feature list after engineering."""
    engineered = ['rain_slope_interaction', 'moisture_clay_risk', 'fault_proximity']
    return FEATURE_COLS + engineered


def split_and_scale(df: pd.DataFrame, test_size: float = 0.2, val_size: float = 0.1):
    """
    Returns:
        X_train, X_val, X_test, y_train, y_val, y_test, scaler
    """
    features = get_features(df)
    X = df[features].values
    y = df[TARGET_COL].values

    # First split: train+val / test
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )

    # Second split: train / val
    val_ratio = val_size / (1 - test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=val_ratio, random_state=42, stratify=y_trainval
    )

    # Scale
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_val   = scaler.transform(X_val)
    X_test  = scaler.transform(X_test)

    # Persist scaler
    scaler_path = MODELS_DIR / 'scaler.pkl'
    joblib.dump(scaler, scaler_path)
    print(f"Scaler saved → {scaler_path}")

    print(f"Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    return X_train, X_val, X_test, y_train, y_val, y_test, scaler


def preprocess_single(record: dict, scaler=None) -> np.ndarray:
    """
    Preprocess a single incoming API request dict into a scaled feature vector.
    record keys must match FEATURE_COLS.
    """
    if scaler is None:
        scaler = joblib.load(MODELS_DIR / 'scaler.pkl')

    df = pd.DataFrame([record])
    df = feature_engineer(df)
    features = get_features(df)
    X = df[features].values
    return scaler.transform(X)


if __name__ == '__main__':
    df = load_data()
    df = clean_data(df)
    df = feature_engineer(df)
    X_train, X_val, X_test, y_train, y_val, y_test, scaler = split_and_scale(df)
    print("Preprocessing complete.")
