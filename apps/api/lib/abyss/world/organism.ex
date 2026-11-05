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
          mode_left: float,
          target: nil | {:flora, non_neg_integer} | {:particle, pos_integer} | {:prey, String.t()},
          chase_left: float,
          sated_left: float,
          energy: float,
          stage: :juvenile | :adult,
          stage_ms: integer,
          generation: pos_integer,
          parent_id: String.t() | nil,
          dividing_left: float
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
    mode_left: 0.0,
    target: nil,
    chase_left: 0.0,
    sated_left: 0.0,
    energy: 50.0,
    stage: :adult,
    stage_ms: 0,
    generation: 1,
    parent_id: nil,
    dividing_left: 0.0
  ]
end
