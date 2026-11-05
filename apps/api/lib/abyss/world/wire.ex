defmodule Abyss.World.Wire do
  @moduledoc "Serialização do mundo para o formato no fio (snapshot e tick)."

  alias Abyss.World.{Sim, Species}

  # Passo de quantização do nível de flora (igual ao de Abyss.World.Flora).
  @quant 0.02

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
        end),
      flora:
        sim.flora.patches
        |> Tuple.to_list()
        |> Enum.map(fn p -> [r(p.x), r(p.z), Float.round(p.q * @quant, 2)] end),
      particles:
        sim.particles.items
        |> Map.values()
        |> Enum.sort_by(& &1.id)
        |> Enum.map(&particle/1)
    }
  end

  @spec tick(Sim.t(), meta) :: map
  def tick(%Sim{} = sim, meta) do
    %{
      world_id: meta.world_id,
      tick: sim.tick,
      server_ms: meta.server_ms,
      o: Enum.map(sim.organisms, fn o -> vec(o.pos) ++ vec(o.vel) end),
      f: Enum.map(sim.food_events.changed, fn {idx, level} -> [idx, level] end),
      ps: Enum.map(sim.food_events.spawned, &particle/1),
      pr: sim.food_events.removed
    }
  end

  # [id, x, y, z, vx, vy, vz, born_ms, life_ms]; `rest_y` fica fora (o cliente lê do mapa).
  defp particle(%{id: id, p0: p0, v: v, born_ms: born, life_ms: life}),
    do: [id] ++ vec(p0) ++ vec4(v) ++ [born, life]

  defp vec4({x, y, z}),
    do: [Float.round(x * 1.0, 4), Float.round(y * 1.0, 4), Float.round(z * 1.0, 4)]

  defp vec({x, y, z}), do: [r(x), r(y), r(z)]
  defp r(n), do: Float.round(n * 1.0, 3)
end
