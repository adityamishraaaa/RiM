import flwr as fl
from tensorflow.keras.models import load_model
import flwr.common as common

# Load pre-trained global model and broadcast its weights at round 0
if __name__ == "__main__":
    # 1. Load your saved pre-trained Keras model
    pretrained_model = load_model("mlp_model_full.keras")
    # 2. Convert weights to Flower parameters
    initial_parameters = common.ndarrays_to_parameters(pretrained_model.get_weights())

    # 3. Define FedAvg strategy with pre-trained initial parameters
    strategy = fl.server.strategy.FedAvg(
        initial_parameters=initial_parameters,
        fraction_fit=1.0,
        min_fit_clients=10,
        min_available_clients=10,
    )

    # 4. Start Flower server
    fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=fl.server.ServerConfig(num_rounds=10),
        strategy=strategy,
    )
