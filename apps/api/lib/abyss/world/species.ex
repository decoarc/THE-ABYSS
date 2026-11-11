defmodule Abyss.World.Species do
  @moduledoc "Tabela fixa de espécies do mundo (ordem canônica)."

  @type t :: %{
          id: atom | String.t(),
          code: String.t(),
          name: String.t(),
          max_speed: float,
          wander: float,
          turn_rate: float,
          body_radius: float,
          run_s: {number, number} | nil,
          pause_s: number | nil,
          diet: :flora | :particles | :predator | {:prey, [atom]},
          perception: float,
          sated_s: number,
          school: boolean,
          shelter: boolean,
          burst: float,
          energy_max: float,
          metabolism: float,
          mature_s: number,
          adult_life_s: number,
          escape: float,
          blueprint: map | nil
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
      sated_s: 10,
      school: false,
      shelter: false,
      burst: 1.0,
      energy_max: 100.0,
      metabolism: 0.18,
      mature_s: 150,
      adult_life_s: 900,
      escape: 0.0,
      blueprint: nil
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
      diet: {:prey, [:celula]},
      perception: 7.0,
      sated_s: 20,
      school: false,
      shelter: true,
      burst: 1.6,
      energy_max: 100.0,
      metabolism: 0.06,
      mature_s: 120,
      adult_life_s: 700,
      escape: 0.0,
      blueprint: nil
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
      sated_s: 25,
      school: false,
      shelter: false,
      burst: 1.0,
      energy_max: 100.0,
      metabolism: 0.14,
      mature_s: 180,
      adult_life_s: 1200,
      escape: 0.0,
      blueprint: nil
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
      sated_s: 8,
      school: true,
      shelter: true,
      burst: 1.8,
      energy_max: 100.0,
      metabolism: 0.25,
      mature_s: 90,
      adult_life_s: 600,
      escape: 0.0,
      blueprint: nil
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
      diet: {:prey, [:filamento, :celula]},
      perception: 8.0,
      sated_s: 20,
      school: false,
      shelter: false,
      burst: 2.5,
      energy_max: 100.0,
      metabolism: 0.02,
      mature_s: 200,
      adult_life_s: 2400,
      escape: 0.0,
      blueprint: nil
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
