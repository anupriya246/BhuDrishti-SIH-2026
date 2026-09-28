"""
BhuSanket - Model Training Script
Trains a Random Forest classifier + optional XGBoost for comparison.
Saves the best model via joblib.
Labels: 0=Low, 1=Moderate, 2=High, 3=Critical
"""

import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score
)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

from preprocess import (
    load_data, clean_data, feature_engineer,
    split_and_scale, LABEL_MAP, get_features
)

MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

LABEL_NAMES = ['Low', 'Moderate', 'High', 'Critical']


# ── Training ──────────────────────────────────────────────────────────────────

def train_random_forest(X_train, y_train):
    print("\nTraining Random Forest...")
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',   # handles class imbalance
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    return rf


def train_gradient_boosting(X_train, y_train):
    print("Training Gradient Boosting (comparison)...")
    gb = GradientBoostingClassifier(
        n_estimators=150,
        learning_rate=0.1,
        max_depth=6,
        random_state=42,
    )
    gb.fit(X_train, y_train)
    return gb


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(model, X, y, split_name='Test'):
    y_pred = model.predict(X)
    acc    = accuracy_score(y, y_pred)
    f1     = f1_score(y, y_pred, average='weighted')
    print(f"\n── {split_name} Results ──────────────────────")
    print(f"Accuracy : {acc:.4f}")
    print(f"F1 Score : {f1:.4f}")
    print(classification_report(y, y_pred, target_names=LABEL_NAMES))
    return acc, f1, y_pred


def plot_confusion_matrix(y_true, y_pred, model_name):
    cm = confusion_matrix(y_true, y_pred)
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.heatmap(
        cm, annot=True, fmt='d', cmap='YlOrRd',
        xticklabels=LABEL_NAMES, yticklabels=LABEL_NAMES, ax=ax
    )
    ax.set_title(f'Confusion Matrix – {model_name}', fontsize=14, fontweight='bold')
    ax.set_ylabel('Actual Risk Level')
    ax.set_xlabel('Predicted Risk Level')
    plt.tight_layout()
    out = MODELS_DIR / f'confusion_matrix_{model_name.lower().replace(" ", "_")}.png'
    plt.savefig(out, dpi=150)
    plt.close()
    print(f"Confusion matrix saved → {out}")


def plot_feature_importance(model, feature_names, model_name):
    importances = model.feature_importances_
    indices     = np.argsort(importances)[::-1]

    fig, ax = plt.subplots(figsize=(10, 6))
    colors = plt.cm.YlOrRd(np.linspace(0.4, 0.9, len(feature_names)))
    ax.bar(range(len(feature_names)), importances[indices], color=colors[indices])
    ax.set_xticks(range(len(feature_names)))
    ax.set_xticklabels([feature_names[i] for i in indices], rotation=45, ha='right')
    ax.set_title(f'Feature Importance – {model_name}', fontsize=14, fontweight='bold')
    ax.set_ylabel('Importance Score')
    plt.tight_layout()
    out = MODELS_DIR / f'feature_importance_{model_name.lower().replace(" ", "_")}.png'
    plt.savefig(out, dpi=150)
    plt.close()
    print(f"Feature importance saved → {out}")


def plot_risk_distribution(y_train, y_test):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for ax, y, title in zip(axes, [y_train, y_test], ['Training Set', 'Test Set']):
        unique, counts = np.unique(y, return_counts=True)
        colors = ['#2ecc71', '#f39c12', '#e74c3c', '#8e44ad']
        ax.bar([LABEL_NAMES[i] for i in unique], counts,
               color=[colors[i] for i in unique], edgecolor='white', linewidth=0.8)
        ax.set_title(f'Risk Distribution – {title}', fontweight='bold')
        ax.set_ylabel('Count')
        for i, (u, c) in enumerate(zip(unique, counts)):
            ax.text(i, c + 20, str(c), ha='center', fontsize=10)
    plt.tight_layout()
    out = MODELS_DIR / 'risk_distribution.png'
    plt.savefig(out, dpi=150)
    plt.close()
    print(f"Distribution plot saved → {out}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # 1. Load & preprocess
    df = load_data()
    df = clean_data(df)
    df = feature_engineer(df)
    X_train, X_val, X_test, y_train, y_val, y_test, scaler = split_and_scale(df)

    feature_names = get_features(df)

    # 2. Train both models
    rf = train_random_forest(X_train, y_train)
    gb = train_gradient_boosting(X_train, y_train)

    # 3. Evaluate on validation set
    print("\n===== VALIDATION RESULTS =====")
    rf_val_acc, rf_val_f1, _ = evaluate(rf, X_val, y_val, 'Validation – Random Forest')
    gb_val_acc, gb_val_f1, _ = evaluate(gb, X_val, y_val, 'Validation – Gradient Boosting')

    # 4. Pick best model
    best_model      = rf if rf_val_f1 >= gb_val_f1 else gb
    best_model_name = 'Random Forest' if rf_val_f1 >= gb_val_f1 else 'Gradient Boosting'
    print(f"\nBest model: {best_model_name}")

    # 5. Final test evaluation
    print("\n===== TEST RESULTS =====")
    test_acc, test_f1, y_pred = evaluate(best_model, X_test, y_test, best_model_name)

    # 6. Visualisations
    plot_confusion_matrix(y_test, y_pred, best_model_name)
    plot_feature_importance(best_model, feature_names, best_model_name)
    plot_risk_distribution(y_train, y_test)

    # 7. Save model
    model_path = MODELS_DIR / 'landslide_model.pkl'
    joblib.dump(best_model, model_path)
    print(f"\nModel saved → {model_path}")

    # 8. Save metadata
    metadata = {
        'model_name':    best_model_name,
        'features':      feature_names,
        'label_map':     LABEL_MAP,
        'test_accuracy': round(test_acc, 4),
        'test_f1':       round(test_f1, 4),
    }
    joblib.dump(metadata, MODELS_DIR / 'model_metadata.pkl')
    print(f"Metadata saved → {MODELS_DIR / 'model_metadata.pkl'}")
    print("\nTraining complete!")
    return best_model, metadata


if __name__ == '__main__':
    main()
