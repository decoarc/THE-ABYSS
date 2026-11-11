defmodule Abyss.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        AbyssWeb.Telemetry,
        Abyss.Repo,
        Abyss.Genesis.RateLimit,
        Abyss.Genesis.Recorder,
        {DNSCluster, query: Application.get_env(:abyss, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: Abyss.PubSub},
        Abyss.World.Observers,
        AbyssWeb.Endpoint
      ] ++ world_children()

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Abyss.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # O Server do mundo vem depois do Endpoint; desligável (`start_world: false` nos testes).
  defp world_children do
    if Application.get_env(:abyss, :start_world, true) do
      [
        {Abyss.World.Server,
         Application.fetch_env!(:abyss, :world) ++
           [
             name: Abyss.World.Server,
             species_loader: &Abyss.Genesis.boot_species/0,
             on_extinct: &Abyss.Genesis.Recorder.record/1,
             broadcast: &AbyssWeb.Endpoint.broadcast!("world:main", "tick", &1)
           ]}
      ]
    else
      []
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    AbyssWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
