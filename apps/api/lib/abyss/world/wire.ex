defmodule Abyss.World.Wire do
  @moduledoc "Serialização do mundo para o formato no fio (snapshot e tick)."

  alias Abyss.World.{Sim, Species}

  @type meta :: %{world_id: String.t(), tick_hz: pos_integer, server_ms: integer}

  @spec snapshot(Sim.t(), meta) :: map
  def snapshot(%Sim{} = sim, meta) do
    %{
      world_id: meta.world_id,
      tick: sim.tick,
      tick_hz: meta.tick_hz,
      server_ms: meta.server_ms,
      map_id: sim.bounds.map.id,
      creature_scale: sim.bounds.creature_scale,
      bounds: Map.take(sim.bounds, [:y_min, :y_max]),
      species:
        Enum.map(Species.all(), fn sp ->
          %{
            id: Atom.to_string(sp.id),
            code: sp.code,
            name: sp.name,
            body_radius: Sim.body_radius(sim, sp.id)
          }
        end),
      organisms:
        Enum.map(sim.organisms, fn o ->
          %{
            id: o.id,
            species: Atom.to_string(o.species),
            born_ms: o.born_ms,
            p: vec(o.pos),
            v: vec(o.vel)
          }
        end)
    }
  end

  @spec tick(Sim.t(), meta) :: map
  def tick(%Sim{} = sim, meta) do
    %{
      world_id: meta.world_id,
      tick: sim.tick,
      server_ms: meta.server_ms,
      o: Enum.map(sim.organisms, fn o -> vec(o.pos) ++ vec(o.vel) end)
    }
  end

  defp vec({x, y, z}), do: [r(x), r(y), r(z)]
  defp r(n), do: Float.round(n * 1.0, 3)
end
