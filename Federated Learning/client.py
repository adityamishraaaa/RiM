# client.py
# ──────────────────────────────────────────────────────────────────────────
# Each client fine‑tunes on its first 8 rows, tests on the remaining 7 rows,
# and writes two CSVs:
#   • train_metrics.csv – metrics from the final training epoch
#   • test_metrics.csv  – metrics on the held‑out test split
#
# Columns in both CSVs: client_id,r2_score,accuracy,mse,mae
#
# Accuracy = percentage‑of‑sign agreement between prediction and target
#            (positive / zero / negative) across both deficit outputs.

import argparse
import csv
import os
import numpy as np
import pandas as pd
import flwr as fl

from sklearn.metrics import (
    r2_score,
    mean_squared_error,
    mean_absolute_error,
)
from sklearn.preprocessing import StandardScaler
import tensorflow as tf
from tensorflow.keras.layers import Input, Dense, BatchNormalization, Dropout
from tensorflow.keras.models import Model

# ──────────────────────────────────────────────────────────────────────────
# Data columns
feature_cols = ["distance", "sleep", "bmi", "age", "breakfast", "meal", "gender"]
target_cols = ["sleep_deficit", "distance_deficit"]

# ──────────────────────────────────────────────────────────────────────────
# Utility: compute & return (r2, acc, mse, mae)
def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray):
    r2 = r2_score(y_true, y_pred, multioutput="uniform_average")
    mse = mean_squared_error(y_true, y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    # sign‑based “accuracy”
    acc = np.mean(np.sign(y_true) == np.sign(y_pred))
    return r2, acc, mse, mae


# Utility: append one row to train_metrics.csv / test_metrics.csv
def _write_metrics_csv(path: str, client_id: int, metrics):
    file_exists = os.path.isfile(path)
    with open(path, mode="a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:  # header once
            writer.writerow(["client_id", "r2_score", "accuracy", "mse", "mae"])
        writer.writerow([client_id, *metrics])


# ──────────────────────────────────────────────────────────────────────────
def load_client_data(client_id: int):
    """Load & scale full client data, return X, y."""
    filename = f"data/data{client_id}.csv"
    data = pd.read_csv(filename)
    X = data[feature_cols].values
    y = data[target_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    return X_scaled, y


def create_base_mlp_model(
    input_dim: int,
    output_dim: int,
    hidden_units=[64, 32, 16, 8, 4],
    dropout_rate=0.2,
):
    inputs = Input(shape=(input_dim,))
    x = BatchNormalization()(inputs)
    for units in hidden_units:
        x = Dense(units, activation="relu")(x)
        x = BatchNormalization()(x)
        x = Dropout(dropout_rate)(x)
    outputs = Dense(output_dim, activation="linear")(x)
    model = Model(inputs=inputs, outputs=outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="mse",
        metrics=["mae"],
    )
    return model


# ──────────────────────────────────────────────────────────────────────────
class MLPClient(fl.client.NumPyClient):
    def __init__(self, client_id: int):
        # Persist ID for later CSV writing
        self.client_id = client_id

        # Load & split data (first 8 rows → train, rest → test)
        X_all, y_all = load_client_data(client_id)
        self.X_train, self.y_train = X_all[:8], y_all[:8]
        self.X_test, self.y_test = X_all[8:], y_all[8:]

        # Build fresh local model
        self.model = create_base_mlp_model(
            input_dim=self.X_train.shape[1],
            output_dim=self.y_train.shape[1],
        )

    # ────────────────────────── Flower interface ──────────────────────────
    def get_parameters(self, config):
        return self.model.get_weights()

    def fit(self, parameters, config):
        # Sync with global model
        self.model.set_weights(parameters)

        # Local fine‑tuning
        history = self.model.fit(
            self.X_train,
            self.y_train,
            epochs=5,
            batch_size=4,
            verbose=0,
        )

        # Metrics on the final epoch (training split)
        y_pred_train = self.model.predict(self.X_train, verbose=0)
        metrics = _compute_metrics(self.y_train, y_pred_train)
        _write_metrics_csv("train_metrics.csv", self.client_id, metrics)

        return self.model.get_weights(), len(self.X_train), {}

    def evaluate(self, parameters, config):
        # Receive last global weights
        self.model.set_weights(parameters)

        # Evaluate on held‑out test split
        y_pred_test = self.model.predict(self.X_test, verbose=0)
        r2, acc, mse, mae = _compute_metrics(self.y_test, y_pred_test)
        _write_metrics_csv("test_metrics.csv", self.client_id, (r2, acc, mse, mae))

        return float(mse), len(self.X_test), {
            "mae": float(mae),
            "r2": float(r2),
            "accuracy": float(acc),
        }


# ──────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--client_id",
        type=int,
        required=True,
        help="Client ID (1‑N, matching data{ID}.csv)",
    )
    args = parser.parse_args()

    fl.client.start_numpy_client(
        server_address="localhost:8080",
        client=MLPClient(args.client_id),
    )
