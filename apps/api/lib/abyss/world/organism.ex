defmodule Abyss.World.Organism do
  @moduledoc "Estado de um organismo (dado puro; nunca um processo)."

  @type vec :: {float, float, float}
  @type t :: %__MODULE__{
          id: String.t(),
          species: atom,
          born_ms: integer,
          pos: vec,
          vel: vec,
          yaw: float,
          pitch: float,
          mode: :run | :pause,
          mode_left: float
        }

  @enforce_keys [:id, :species, :born_ms, :pos]
  defstruct [
    :id,
    :species,
    :born_ms,
    :pos,
    vel: {0.0, 0.0, 0.0},
    yaw: 0.0,
    pitch: 0.0,
    mode: :run,
    mode_left: 0.0
  ]
end
