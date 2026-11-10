defmodule AbyssWeb.Router do
  use AbyssWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", AbyssWeb do
    pipe_through :api

    get "/health", HealthController, :show
    get "/stats", StatsController, :show

    get "/genesis/catalog", GenesisController, :catalog
    post "/genesis/submit", GenesisController, :submit
    post "/genesis/confirm", GenesisController, :confirm
  end

  # Caixa de e-mail de desenvolvimento (Swoosh.Adapters.Local); só com dev_routes.
  # O MailboxPreview é um Plug.Router autônomo: não precisa de sessão.
  if Application.compile_env(:abyss, :dev_routes) do
    scope "/dev" do
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
