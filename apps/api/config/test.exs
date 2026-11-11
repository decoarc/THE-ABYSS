import Config

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :abyss, AbyssWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "ksNDwIEBJnjnyUT0IqsaRzIKg1tpqqQ4oVwVabH/eI+jbLeoKSd7jAN9ha8q9O0W",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

# O mundo global não sobe nos testes; cada teste inicia o seu Server.
config :abyss, start_world: false

# Banco de teste: mesmo servidor do DATABASE_URL, outro nome de banco.
test_db = "abyss_test#{System.get_env("MIX_TEST_PARTITION")}"

if url = System.get_env("DATABASE_URL") do
  uri = URI.parse(url)
  config :abyss, Abyss.Repo, url: URI.to_string(%{uri | path: "/" <> test_db})
else
  config :abyss, Abyss.Repo,
    username: "postgres",
    password: "postgres",
    hostname: "localhost",
    database: test_db
end

config :abyss, Abyss.Repo,
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :abyss, Abyss.Mailer, adapter: Swoosh.Adapters.Test
