defmodule Abyss.World.Species do
  @moduledoc "Tabela fixa de espécies do mundo (ordem canônica)."

  @type t :: %{
          id: atom,
          code: String.t(),
          name: String.t(),
          max_speed: float,
          wander: float,
          turn_rate: float,
          body_radius: float,
          run_s: {number, number} | nil,
          pause_s: number | nil,
          diet: :flora | :particles | :none,
          perception: float | nil,
          sated_s: number | nil
        }

  @species [
    %{
      id: :membrana,
      code: "MBR",
      name: "Membrana",
      max_speed: 0.25,
      wander: 0.35,
      turn_rate: 0.6,
      body_radius: 1.1,
      run_s: nil,
      pause_s: nil,
      diet: :particles,
      perception: 6.0,
      sated_s: 20
    },
    %{
      id: :filamento,
      code: "FIL",
      name: "Filamento",
      max_speed: 0.9,
      wander: 0.8,
      turn_rate: 1.5,
      body_radius: 0.5,
      run_s: nil,
      pause_s: nil,
      diet: :none,
      perception: nil,
      sated_s: nil
    },
    %{
      id: :casco,
      code: "CAS",
      name: "Casco",
      max_speed: 0.06,
      wander: 0.2,
      turn_rate: 0.4,
      body_radius: 1.2,
      run_s: nil,
      pause_s: nil,
      diet: :flora,
      perception: 4.0,
      sated_s: 30
    },
    %{
      id: :celula,
      code: "CEL",
      name: "Célula",
      max_speed: 0.35,
      wander: 0.25,
      turn_rate: 1.0,
      body_radius: 1.0,
      run_s: {8, 14},
      pause_s: 3,
      diet: :flora,
      perception: 6.0,
      sated_s: 20
    },
    %{
      id: :poliedro,
      code: "POL",
      name: "Poliedro",
      max_speed: 0.08,
      wander: 0.2,
      turn_rate: 0.4,
      body_radius: 1.3,
      run_s: nil,
      pause_s: nil,
      diet: :none,
      perception: nil,
      sated_s: nil
    }
  ]

  # Consulta por id em tempo constante: get!/1 roda várias vezes por organismo por tick.
  @by_id Map.new(@species, &{&1.id, &1})

  @spec all() :: [t]
  def all, do: @species

  @spec get!(atom) :: t
  def get!(id) do
    case @by_id do
      %{^id => sp} -> sp
      _ -> raise ArgumentError, "espécie desconhecida: #{inspect(id)}"
    end
  end
end
