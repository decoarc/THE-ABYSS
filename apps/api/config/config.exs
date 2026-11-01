# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :abyss,
  generators: [timestamp_type: :utc_datetime]

# Mapa compartilhado com o cliente (montado em /shared pelo compose).
config :abyss, :map_path, "/shared/world/map-e1.json"

# Mundo simulado (valores iniciais; ajustáveis na Parada 1).
# seed: nil -> aleatório na partida; inteiro -> determinístico.
config :abyss, :world,
  population: 150,
  tick_hz: 10,
  seed: nil,
  # Espécies de teste do E1; false = mundo sem organismos (só comida).
  test_species: true,
  # Raio efetivo = body_radius × creature_scale.
  creature_scale: 0.5

# Configure the endpoint
config :abyss, AbyssWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: AbyssWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Abyss.PubSub,
  live_view: [signing_salt: "W+CTfKcX"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
