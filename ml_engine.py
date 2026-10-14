"""
ml_engine.py — SHAP-based Crime Risk Prediction Engine
=======================================================
Trains an XGBoost binary classifier on synthetic historical Kerala Police
incident features and exposes two public callables:

    predict_risk(district, hour, day_of_week, weather_risk_index)
        -> Returns probability, base_score, and per-feature SHAP breakdown.

    generate_tactical_briefing(district, prediction_result)
        -> Returns a professional, human-readable tactical summary for officers.

The model is trained once at module import time and held in memory for the
lifetime of the FastAPI process.  All numpy / shap objects are converted to
plain Python scalars before returning so FastAPI JSON serialisation never fails.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import numpy as np

logger = logging.getLogger("sentinel_patrol.ml_engine")

# ---------------------------------------------------------------------------
# Kerala districts — identical list used in admin_routes.py / MapView.jsx
# ---------------------------------------------------------------------------
KERALA_DISTRICTS: list[str] = [
    "Thiruvananthapuram",
    "Kollam",
    "Pathanamthitta",
    "Alappuzha",
    "Kottayam",
    "Idukki",
    "Ernakulam",
    "Thrissur",
    "Palakkad",
    "Malappuram",
    "Kozhikode",
    "Wayanad",
    "Kannur",
    "Kasaragod",
]

# Numeric district encoding (0-indexed, stable order)
_DISTRICT_INDEX: dict[str, int] = {d: i for i, d in enumerate(KERALA_DISTRICTS)}

# Feature names surfaced in API responses and SHAP briefings
FEATURE_NAMES: list[str] = [
    "hour_of_day",
    "day_of_week",
    "district_encoded",
    "historical_crime_density",
    "weather_risk_index",
]

# ---------------------------------------------------------------------------
# Lazy-import heavy ML dependencies so startup failures are clearly reported
# ---------------------------------------------------------------------------
try:
    from xgboost import XGBClassifier          # type: ignore
    import shap                                # type: ignore

    # --- WORKAROUND FOR SHAP COMPATIBILITY WITH XGBOOST 3.0+ ---
    # XGBoost 3.0+ serializes learner_model_param["base_score"] as a bracketed string like "[3.5375E-1]",
    # which causes float(learner_model_param["base_score"]) in SHAP's XGBTreeModelLoader to raise ValueError.
    # We intercept decode_ubjson_buffer to strip the brackets and prevent server crashes.
    try:
        import shap.explainers._tree as _shap_tree
        _orig_decode_ubjson = _shap_tree.decode_ubjson_buffer

        def _safe_decode_ubjson(fd):
            res = _orig_decode_ubjson(fd)
            try:
                bs = res["learner"]["learner_model_param"]["base_score"]
                if isinstance(bs, str) and bs.startswith("["):
                    res["learner"]["learner_model_param"]["base_score"] = bs.strip("[]")
            except Exception:
                pass
            return res

        _shap_tree.decode_ubjson_buffer = _safe_decode_ubjson
    except Exception as _patch_err:
        logger.warning(f"Could not apply SHAP/XGBoost 3.0+ compatibility patch: {_patch_err}")

    _ML_AVAILABLE = True
    _ML_IMPORT_ERROR = ""
except ImportError as _ml_err:
    _ML_AVAILABLE = False
    _ML_IMPORT_ERROR = str(_ml_err)

# ---------------------------------------------------------------------------
# Per-district baseline crime density (0.0-1.0)
# Derived from publicly reported Kerala crime statistics patterns.
# ---------------------------------------------------------------------------
_DISTRICT_CRIME_DENSITY: dict[str, float] = {
    "Thiruvananthapuram": 0.72,
    "Kollam":             0.61,
    "Pathanamthitta":     0.38,
    "Alappuzha":          0.55,
    "Kottayam":           0.44,
    "Idukki":             0.31,
    "Ernakulam":          0.78,
    "Thrissur":           0.65,
    "Palakkad":           0.53,
    "Malappuram":         0.60,
    "Kozhikode":          0.68,
    "Wayanad":            0.29,
    "Kannur":             0.57,
    "Kasaragod":          0.42,
}


# ---------------------------------------------------------------------------
# Synthetic training-data generation
# ---------------------------------------------------------------------------
def _generate_synthetic_training_data(
    n_samples: int = 4000,
    random_seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic training samples with realistic feature distributions.

    Feature vector (ordered as FEATURE_NAMES):
        hour_of_day               0-23
        day_of_week               0 (Mon) - 6 (Sun)
        district_encoded          0-13
        historical_crime_density  0.0-1.0
        weather_risk_index        0.0-1.0

    Label: binary high-risk indicator constructed from a weighted rule that
    matches intuitive police knowledge (night hours + high density -> high risk).
    Gaussian noise is added to prevent trivially perfect training fits.
    """
    rng = np.random.default_rng(random_seed)

    hours   = rng.integers(0, 24, n_samples)
    days    = rng.integers(0, 7,  n_samples)
    dist_i  = rng.integers(0, len(KERALA_DISTRICTS), n_samples)
    density = np.array([
        _DISTRICT_CRIME_DENSITY[KERALA_DISTRICTS[i]] for i in dist_i
    ]) + rng.normal(0, 0.05, n_samples)
    density = np.clip(density, 0.0, 1.0)
    weather = rng.uniform(0.0, 1.0, n_samples)

    # Night-time penalty: highest risk 22:00-03:59, moderate 20:00-05:59
    hour_risk = np.where(
        (hours >= 22) | (hours <= 3), 1.0,
        np.where((hours >= 20) | (hours <= 5), 0.65, 0.25)
    )
    weekend_risk = np.where(days >= 5, 0.15, 0.0)

    # Weighted composite score
    composite = (
        0.35 * hour_risk
        + 0.32 * density
        + 0.18 * weather
        + 0.15 * weekend_risk
        + rng.normal(0, 0.06, n_samples)
    )
    composite = np.clip(composite, 0.0, 1.0)
    labels = (composite >= 0.5).astype(int)

    X = np.column_stack([hours, days, dist_i, density, weather])
    return X.astype(np.float32), labels


# ---------------------------------------------------------------------------
# Model training (runs once at module import)
# ---------------------------------------------------------------------------
_model: "XGBClassifier | None" = None
_explainer: "shap.TreeExplainer | None" = None
_base_score: float = 0.5


def _train_model() -> None:
    """Train XGBClassifier and initialise SHAP TreeExplainer in-process."""
    global _model, _explainer, _base_score

    if not _ML_AVAILABLE:
        logger.error(
            "ML dependencies (xgboost, shap) not installed. "
            "Run: pip install xgboost shap"
        )
        return

    logger.info("[ML Engine] Generating synthetic training data...")
    X_train, y_train = _generate_synthetic_training_data()

    logger.info("[ML Engine] Training XGBClassifier...")
    _model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric="logloss",
        random_state=42,
        tree_method="hist",   # Fast and CPU-efficient; works on Windows
        verbosity=0,
    )
    _model.fit(X_train, y_train)

    logger.info("[ML Engine] Initialising SHAP TreeExplainer...")
    _explainer = shap.TreeExplainer(_model)

    # Expected value: SHAP versions differ on what TreeExplainer returns for
    # binary XGBClassifier.  Possible shapes:
    #   - list of two scalars  [neg_ev, pos_ev]   (older SHAP <= 0.41)
    #   - numpy array shape (1,)                   (newer SHAP)
    #   - plain scalar
    ev = _explainer.expected_value
    if hasattr(ev, "__len__"):
        if len(ev) == 2:
            _base_score = float(ev[1])   # positive-class intercept
        else:
            _base_score = float(ev[0])
    else:
        _base_score = float(ev)

    logger.info(f"[ML Engine] Ready. Base log-odds score: {_base_score:.4f}")


# Kick off training immediately on import
_train_model()


# ---------------------------------------------------------------------------
# Public prediction API
# ---------------------------------------------------------------------------
def _encode_district(district: str) -> int:
    """Return district index; raises ValueError for unknown districts."""
    for d in KERALA_DISTRICTS:
        if d.lower() == district.strip().lower():
            return _DISTRICT_INDEX[d]
    raise ValueError(
        f"Unknown district '{district}'. "
        f"Valid options: {', '.join(KERALA_DISTRICTS)}"
    )


def _lookup_district(district: str) -> str:
    """Return the canonical spelling for a district name."""
    for d in KERALA_DISTRICTS:
        if d.lower() == district.strip().lower():
            return d
    raise ValueError(f"Unknown district '{district}'.")


def predict_risk(
    district: str,
    hour: int,
    day_of_week: int,
    weather_risk_index: float = 0.3,
) -> dict[str, Any]:
    """
    Run a single prediction and return risk probability + SHAP breakdown.

    Parameters
    ----------
    district           : Kerala district name (case-insensitive).
    hour               : Hour of the day (0-23, local IST).
    day_of_week        : 0 = Monday, 6 = Sunday.
    weather_risk_index : 0.0 (clear) - 1.0 (severe weather).

    Returns
    -------
    dict with keys:
        district, hour, day_of_week, weather_risk_index
        risk_probability_pct  - float, e.g. 73.4 (%)
        risk_level            - "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
        base_risk_score       - model intercept in log-odds space
        shap_effects          - list of feature SHAP dicts (sorted by |shap|)
        shap_sum              - sum of all SHAP values
    """
    if _model is None or _explainer is None:
        raise RuntimeError(
            "ML model not available. Install xgboost and shap, then restart the server."
        )

    if not 0 <= hour <= 23:
        raise ValueError(f"hour must be 0-23, got {hour}")
    if not 0 <= day_of_week <= 6:
        raise ValueError(f"day_of_week must be 0-6, got {day_of_week}")
    if not 0.0 <= weather_risk_index <= 1.0:
        raise ValueError(f"weather_risk_index must be 0.0-1.0, got {weather_risk_index}")

    canonical = _lookup_district(district)
    district_enc = _DISTRICT_INDEX[canonical]
    district_density = _DISTRICT_CRIME_DENSITY[canonical]

    X = np.array([[
        float(hour),
        float(day_of_week),
        float(district_enc),
        district_density,
        float(weather_risk_index),
    ]], dtype=np.float32)

    # Probability
    proba = float(_model.predict_proba(X)[0][1])
    risk_pct = round(proba * 100, 2)

    if risk_pct < 30:
        risk_level = "LOW"
    elif risk_pct < 55:
        risk_level = "MODERATE"
    elif risk_pct < 75:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    # SHAP values — handle version differences in return shape:
    #   SHAP <= 0.41 (binary): list of two ndarrays [(n,5), (n,5)]
    #   SHAP >= 0.42 (binary): single ndarray (n,5) for the positive class
    shap_values = _explainer.shap_values(X)
    if isinstance(shap_values, list):
        # Older SHAP: [neg_class_array, pos_class_array]
        sv_row = np.array(shap_values[1][0])
    else:
        sv_arr = np.array(shap_values)
        # Shape (1, n_features) → take first (only) sample
        if sv_arr.ndim == 2:
            sv_row = sv_arr[0]
        else:
            sv_row = sv_arr

    feature_values = X[0]
    shap_effects = []
    for fname, fval, sval in zip(FEATURE_NAMES, feature_values, sv_row):
        shap_effects.append({
            "feature":     fname,
            "value":       _format_feature_value(fname, float(fval)),
            "raw_value":   round(float(fval), 4),
            "shap_effect": round(float(sval), 4),
            "direction":   "increases_risk" if sval > 0 else "decreases_risk",
        })

    # Sort by absolute SHAP magnitude descending (most influential first)
    shap_effects.sort(key=lambda x: abs(x["shap_effect"]), reverse=True)

    return {
        "district":             canonical,
        "hour":                 hour,
        "day_of_week":          day_of_week,
        "weather_risk_index":   round(float(weather_risk_index), 3),
        "risk_probability_pct": risk_pct,
        "risk_level":           risk_level,
        "base_risk_score":      round(_base_score, 4),
        "shap_effects":         shap_effects,
        "shap_sum":             round(float(np.sum(sv_row)), 4),
    }


def _format_feature_value(feature_name: str, raw: float) -> str:
    """Return a human-readable string for a raw feature value."""
    if feature_name == "hour_of_day":
        h = int(raw)
        suffix = "AM" if h < 12 else "PM"
        display = h if h <= 12 else h - 12
        if display == 0:
            display = 12
        return f"{display:02d}:00 {suffix}"
    if feature_name == "day_of_week":
        days = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
        return days[int(raw)] if 0 <= int(raw) <= 6 else str(int(raw))
    if feature_name == "district_encoded":
        idx = int(raw)
        return KERALA_DISTRICTS[idx] if 0 <= idx < len(KERALA_DISTRICTS) else str(idx)
    if feature_name == "historical_crime_density":
        return f"{round(raw * 100, 1)}%"
    if feature_name == "weather_risk_index":
        return f"{round(raw, 2)} / 1.0"
    return str(round(raw, 4))


# ---------------------------------------------------------------------------
# Tactical briefing generator
# ---------------------------------------------------------------------------
_DAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]

_HOUR_RANGES = [
    (range(0, 5),   "Late Night",    "0000-0459 hrs"),
    (range(5, 9),   "Early Morning", "0500-0859 hrs"),
    (range(9, 12),  "Morning",       "0900-1159 hrs"),
    (range(12, 14), "Midday",        "1200-1359 hrs"),
    (range(14, 17), "Afternoon",     "1400-1659 hrs"),
    (range(17, 20), "Evening",       "1700-1959 hrs"),
    (range(20, 24), "Night",         "2000-2359 hrs"),
]


def _get_hour_period(hour: int) -> tuple[str, str]:
    for r, name, rng in _HOUR_RANGES:
        if hour in r:
            return name, rng
    return "Unknown", ""


def generate_tactical_briefing(
    district: str,
    prediction_result: dict[str, Any],
) -> str:
    """
    Converts a predict_risk() result into a professional tactical briefing
    suitable for display in the AI chat terminal.
    """
    rp   = prediction_result["risk_probability_pct"]
    lvl  = prediction_result["risk_level"]
    h    = prediction_result["hour"]
    dow  = prediction_result["day_of_week"]
    wri  = prediction_result["weather_risk_index"]
    fx   = prediction_result["shap_effects"]   # already sorted by |shap|
    base = prediction_result["base_risk_score"]

    day_name         = _DAY_NAMES[dow] if 0 <= dow <= 6 else f"Day {dow}"
    period, time_rng = _get_hour_period(h)

    risk_emoji = {"LOW": "GREEN", "MODERATE": "AMBER", "HIGH": "ORANGE", "CRITICAL": "RED"}[lvl]

    top3 = fx[:3]
    factor_lines = []
    for i, f in enumerate(top3, 1):
        arrow = "UP " if f["direction"] == "increases_risk" else "DWN"
        factor_lines.append(
            f"  {i}. [{arrow}] {f['feature'].replace('_', ' ').title()}"
            f" [{f['value']}]  SHAP: {f['shap_effect']:+.4f}"
        )
    factors_block = "\n".join(factor_lines)

    recommendations = {
        "LOW": (
            "  * Maintain standard patrol frequency.\n"
            "  * Continue routine community liaison activities.\n"
            "  * No immediate resource surge required."
        ),
        "MODERATE": (
            "  * Increase patrol passes through high-density commercial zones.\n"
            "  * Coordinate with beat officers for situational updates.\n"
            "  * Keep Quick Response Team (QRT) on standby."
        ),
        "HIGH": (
            "  * Deploy additional patrol units immediately.\n"
            "  * Activate CCTV monitoring of identified hotspots.\n"
            "  * Alert QRT and maintain 15-minute response posture.\n"
            "  * Brief officers on known active suspects in district."
        ),
        "CRITICAL": (
            "  * IMMEDIATE: Surge patrol density across district.\n"
            "  * Activate inter-station coordination protocol.\n"
            "  * Notify District SP for resource authorisation.\n"
            "  * QRT must be deployed — not on standby.\n"
            "  * Initiate checkpoint operations at key transit points."
        ),
    }[lvl]

    briefing = (
        f"{'=' * 44}\n"
        f"  SENTINEL ML — CRIME RISK ASSESSMENT\n"
        f"{'=' * 44}\n"
        f"  District   : {district}\n"
        f"  Timeframe  : {day_name}, {period} ({time_rng})\n"
        f"  Weather Idx: {wri:.2f} / 1.00\n"
        f"{'=' * 44}\n"
        f"\n"
        f"  RISK LEVEL  : [{risk_emoji}] {lvl}\n"
        f"  PROBABILITY : {rp:.1f}%\n"
        f"  BASE SCORE  : {base:+.4f} (model intercept)\n"
        f"\n"
        f"  -- TOP RISK FACTORS (SHAP) --\n"
        f"{factors_block}\n"
        f"\n"
        f"  SHAP Note: Positive (+) values increase predicted risk;\n"
        f"  negative (-) values lower it. Magnitude = strength.\n"
        f"\n"
        f"  -- TACTICAL RECOMMENDATIONS --\n"
        f"{recommendations}\n"
        f"{'=' * 44}\n"
        f"  Model: XGBoost (200 trees) + SHAP TreeExplainer\n"
        f"  This tool supports — not replaces — officer judgement.\n"
        f"{'=' * 44}"
    )
    return briefing


# ---------------------------------------------------------------------------
# Slash-command router  (/predict, /explain, /help)
# ---------------------------------------------------------------------------
def handle_slash_command(
    command_text: str,
    last_prediction: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Parse and execute /predict or /explain commands entered in the AI terminal.

    Supported syntax:
        /predict <district>
        /predict <district> <hour> <day_of_week> [weather_risk_index]
        /explain            (explains the most recent /predict result)
        /help

    Parameters
    ----------
    command_text    : The raw command string from the chat input.
    last_prediction : The raw predict_risk() dict from the most recent
                      /predict call (passed in by the frontend).  Used by
                      /explain to generate a contextual breakdown.

    Returns a dict with:
        type        - "prediction" | "explanation" | "help" | "error"
        briefing    - the plain-text tactical briefing string
        prediction  - the raw predict_risk() result dict (or None)
        error       - error message string (None on success)
    """
    parts = command_text.strip().split()
    if not parts:
        return _help_response()

    cmd = parts[0].lower()

    if cmd in ("/help", "help"):
        return _help_response()

    if cmd in ("/predict", "predict"):
        if len(parts) < 2:
            return {
                "type": "error",
                "briefing": (
                    "Usage: /predict <district>  [hour 0-23]  "
                    "[day 0-6]  [weather 0.0-1.0]\n"
                    "Example: /predict Ernakulam 22 5 0.4"
                ),
                "prediction": None,
                "error": "Missing district argument.",
            }

        district = parts[1]
        now_ist = datetime.now()
        try:
            hour        = int(parts[2])   if len(parts) > 2 else now_ist.hour
            day_of_week = int(parts[3])   if len(parts) > 3 else now_ist.weekday()
            weather     = float(parts[4]) if len(parts) > 4 else 0.3
        except (ValueError, IndexError) as exc:
            return {
                "type":       "error",
                "briefing":   f"Invalid parameter format: {exc}",
                "prediction": None,
                "error":      str(exc),
            }

        try:
            result   = predict_risk(district, hour, day_of_week, weather)
            briefing = generate_tactical_briefing(district, result)
            return {
                "type":       "prediction",
                "briefing":   briefing,
                "prediction": result,
                "error":      None,
            }
        except (ValueError, RuntimeError) as exc:
            return {
                "type":       "error",
                "briefing":   f"Prediction failed: {exc}",
                "prediction": None,
                "error":      str(exc),
            }

    if cmd in ("/explain", "explain"):
        if not last_prediction:
            return {
                "type":       "error",
                "briefing": (
                    "No previous prediction to explain.\n"
                    "Run /predict <district> first, then use /explain "
                    "to see why the model made that decision."
                ),
                "prediction": None,
                "error":      "No prediction available to explain.",
            }
        explanation = _generate_shap_explanation(last_prediction)
        return {
            "type":       "explanation",
            "briefing":   explanation,
            "prediction": last_prediction,
            "error":      None,
        }

    return {
        "type":       "error",
        "briefing":   f"Unknown command '{cmd}'. Type /predict, /explain, or /help.",
        "prediction": None,
        "error":      f"Unknown command: {cmd}",
    }


# ---------------------------------------------------------------------------
# Contextual SHAP explanation generator
# ---------------------------------------------------------------------------
_FEATURE_EXPLANATIONS: dict[str, dict[str, str]] = {
    "hour_of_day": {
        "increases_risk": (
            "Late-night and early-morning hours see elevated crime "
            "rates due to reduced public visibility and fewer witnesses."
        ),
        "decreases_risk": (
            "Daytime hours generally carry lower risk — higher foot "
            "traffic and visibility act as natural deterrents."
        ),
    },
    "day_of_week": {
        "increases_risk": (
            "Weekend days (Fri-Sun) correlate with higher social "
            "activity, gatherings, and alcohol-related incidents."
        ),
        "decreases_risk": (
            "Weekdays tend to have more structured routines and lower "
            "incident rates compared to weekends."
        ),
    },
    "district_encoded": {
        "increases_risk": (
            "This district's geographic and demographic profile places "
            "it in a higher-risk category relative to the state average."
        ),
        "decreases_risk": (
            "This district's profile carries a lower baseline risk "
            "compared to high-density urban districts."
        ),
    },
    "historical_crime_density": {
        "increases_risk": (
            "The district has a high historical crime density — past "
            "incident frequency is one of the strongest predictors "
            "of future risk."
        ),
        "decreases_risk": (
            "The district's historical crime density is relatively low, "
            "pulling the overall risk prediction downward."
        ),
    },
    "weather_risk_index": {
        "increases_risk": (
            "Adverse weather conditions (heavy rain, flooding) reduce "
            "patrol effectiveness, increase response times, and can "
            "trigger opportunistic crime."
        ),
        "decreases_risk": (
            "Clear or mild weather supports normal patrol coverage "
            "and faster response, lowering predicted risk."
        ),
    },
}


def _generate_shap_explanation(prediction: dict[str, Any]) -> str:
    """
    Build a detailed, officer-friendly narrative explaining *why* the model
    produced a specific risk prediction, using the per-feature SHAP values.
    """
    district = prediction.get("district", "Unknown")
    risk_pct = prediction.get("risk_probability_pct", 0)
    risk_lvl = prediction.get("risk_level", "UNKNOWN")
    base     = prediction.get("base_risk_score", 0)
    shap_sum = prediction.get("shap_sum", 0)
    effects  = prediction.get("shap_effects", [])
    hour     = prediction.get("hour", 0)
    dow      = prediction.get("day_of_week", 0)

    day_name         = _DAY_NAMES[dow] if 0 <= dow <= 6 else f"Day {dow}"
    period, time_rng = _get_hour_period(hour)

    # Separate features into risk-increasing and risk-decreasing groups
    risk_up   = [f for f in effects if f["direction"] == "increases_risk"]
    risk_down = [f for f in effects if f["direction"] == "decreases_risk"]

    # Build per-feature explanation lines
    factor_lines = []
    for i, f in enumerate(effects, 1):
        fname   = f["feature"]
        display = f["feature"].replace("_", " ").title()
        value   = f["value"]
        shap_v  = f["shap_effect"]
        dirn    = f["direction"]
        arrow   = "▲" if dirn == "increases_risk" else "▼"

        # Get the contextual why-explanation
        why = _FEATURE_EXPLANATIONS.get(fname, {}).get(
            dirn, "This feature influenced the prediction."
        )

        factor_lines.append(
            f"  {i}. {arrow} {display}  =  {value}\n"
            f"     SHAP: {shap_v:+.4f}  →  {'INCREASES' if dirn == 'increases_risk' else 'DECREASES'} risk\n"
            f"     Why: {why}"
        )

    factors_block = "\n\n".join(factor_lines)

    # Build the overall narrative summary
    if risk_pct >= 75:
        verdict = (
            f"The model is highly confident ({risk_pct:.1f}%) that this is a "
            f"CRITICAL risk scenario. The dominant driver is "
            f"\"{effects[0]['feature'].replace('_', ' ')}\" which alone "
            f"contributes a SHAP effect of {effects[0]['shap_effect']:+.4f}."
        )
    elif risk_pct >= 55:
        verdict = (
            f"The model predicts HIGH risk ({risk_pct:.1f}%). Multiple "
            f"factors combine to push the prediction above the baseline — "
            f"primarily \"{effects[0]['feature'].replace('_', ' ')}\"."
        )
    elif risk_pct >= 30:
        verdict = (
            f"The model predicts MODERATE risk ({risk_pct:.1f}%). Risk-increasing "
            f"and risk-decreasing factors partially cancel each other out."
        )
    else:
        verdict = (
            f"The model predicts LOW risk ({risk_pct:.1f}%). Most features "
            f"are pulling the prediction below the baseline threshold."
        )

    explanation = (
        f"{'=' * 52}\n"
        f"  SHAP DECISION EXPLANATION\n"
        f"{'=' * 52}\n"
        f"  Explaining prediction for:\n"
        f"    District  : {district}\n"
        f"    Timeframe : {day_name}, {period} ({time_rng})\n"
        f"    Result    : [{risk_lvl}] {risk_pct:.1f}% risk\n"
        f"{'=' * 52}\n"
        f"\n"
        f"  VERDICT: {verdict}\n"
        f"\n"
        f"  HOW THE MODEL REACHED THIS DECISION:\n"
        f"  Base score (before features): {base:+.4f}\n"
        f"  Total SHAP adjustment:        {shap_sum:+.4f}\n"
        f"  Features pushing risk UP:     {len(risk_up)}\n"
        f"  Features pushing risk DOWN:   {len(risk_down)}\n"
        f"\n"
        f"  -- FEATURE-BY-FEATURE BREAKDOWN --\n"
        f"  (Sorted by influence strength, strongest first)\n"
        f"\n"
        f"{factors_block}\n"
        f"\n"
        f"  -- HOW TO READ THIS --\n"
        f"  ▲ = feature pushes risk HIGHER\n"
        f"  ▼ = feature pushes risk LOWER\n"
        f"  SHAP magnitude = strength of influence\n"
        f"  P(risk) ≈ sigmoid({base:+.4f} + {shap_sum:+.4f})\n"
        f"\n"
        f"{'=' * 52}\n"
        f"  To run a new prediction: /predict <district>\n"
        f"{'=' * 52}"
    )
    return explanation


def _help_response() -> dict[str, Any]:
    text = (
        f"{'=' * 44}\n"
        f"  SENTINEL ML — COMMAND REFERENCE\n"
        f"{'=' * 44}\n"
        f"\n"
        f"  /predict <district>\n"
        f"    Predict crime risk for a Kerala district\n"
        f"    using the current IST time.\n"
        f"\n"
        f"  /predict <district> <hour> <day> [weather]\n"
        f"    Predict with custom parameters:\n"
        f"      hour    : 0-23 (IST)\n"
        f"      day     : 0=Mon ... 6=Sun\n"
        f"      weather : 0.0-1.0 (optional, default 0.3)\n"
        f"\n"
        f"  /explain\n"
        f"    Explain *why* the last prediction was made.\n"
        f"    Shows per-feature SHAP reasoning & impact.\n"
        f"    (Requires a /predict first.)\n"
        f"\n"
        f"  Examples:\n"
        f"    /predict Ernakulam\n"
        f"    /predict Kozhikode 22 5\n"
        f"    /predict Thrissur 14 2 0.7\n"
        f"    /explain\n"
        f"{'=' * 44}"
    )
    return {
        "type":       "help",
        "briefing":   text,
        "prediction": None,
        "error":      None,
    }

