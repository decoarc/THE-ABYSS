defmodule AbyssWeb.Router do
  use AbyssWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", AbyssWeb do
    pipe_through :api

    get "/health", HealthController, :show
  end
end
