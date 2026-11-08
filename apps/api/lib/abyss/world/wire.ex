defmodule Abyss.World.Wire do
  @moduledoc "Serialização do mundo para o formato no fio (snapshot e tick)."

  alias Abyss.World.Sim

  # Passo de quantização do nível de flora (igual ao de Abyss.World.Flora).
  @quant 0.02

  @type meta :: %{world_id: String.t(), tick_hz: pos_integer, server_ms: integer}

  @spec snapshot(Sim.t(), meta) :: map
  def snapshot(%Sim{} = sim, meta) do
    emax = energy_max(sim)

    %{
      world_id: meta.world_id,
      tick: sim.tick,
      tick_hz: meta.tick_hz,
      server_ms: meta.server_ms,
      map_id: sim.bounds.map.id,
      creature_scale: sim.bounds.creature_scale,
      bounds: Map.take(sim.bounds, [:y_min, :y_max]),
      species:
        Enum.map(Sim.species(sim), fn sp ->
          %{
            id: Atom.to_string(sp.id),
            code: sp.code,
            name: sp.name,
            body_radius: Sim.body_radius(sim, sp.id),
            diet: diet(sp.diet),
            extinct_ms: Map.get(sim.extinct, sp.id)
          }
        end),
      juvenile_scale: sim.ecology.juvenile_scale,
      divide_s: sim.ecology.divide_s,
      organisms: Enum.map(sim.organisms, &organism(&1, emax)),
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
    emax = energy_max(sim)
    ev = sim.life_events

    %{
      world_id: meta.world_id,
      tick: sim.tick,
      server_ms: meta.server_ms,
      o:
        Enum.map(sim.organisms, fn o ->
          vec(o.pos) ++ vec(o.vel) ++ [energy(o, emax), flags(o)]
        end),
      b: Enum.map(ev.births, &organism(&1, emax)),
      d: Enum.map(ev.deaths, fn {id, cause} -> [id, Atom.to_string(cause)] end),
      x: Enum.map(ev.extinct, fn {id, ms} -> [Atom.to_string(id), ms] end),
      f: Enum.map(sim.food_events.changed, fn {idx, level} -> [idx, level] end),
      ps: Enum.map(sim.food_events.spawned, &particle/1),
      pr: sim.food_events.removed
    }
  end

  defp organism(o, emax) do
    %{
      id: o.id,
      species: Atom.to_string(o.species),
      born_ms: o.born_ms,
      p: vec(o.pos),
      v: vec(o.vel),
      e: energy(o, emax),
      stage: Atom.to_string(o.stage),
      dividing: o.dividing_left > 0,
      gen: o.generation,
      parent: o.parent_id
    }
  end

  defp energy_max(sim), do: Map.new(Sim.species(sim), &{&1.id, &1.energy_max})

  # Energia relativa ao máximo da espécie, em 0..1 com 2 casas.
  defp energy(o, emax) do
    (o.energy / Map.fetch!(emax, o.species)) |> max(0.0) |> min(1.0) |> Float.round(2)
  end

  # bit 1 = jovem; bit 2 = dividindo.
  defp flags(o) do
    (if o.stage == :juvenile, do: 1, else: 0) + if o.dividing_left > 0, do: 2, else: 0
  end

  defp diet({:prey, ids}), do: %{kind: "prey", prey: Enum.map(ids, &Atom.to_string/1)}
  defp diet(kind) when is_atom(kind), do: %{kind: Atom.to_string(kind), prey: []}

  # [id, x, y, z, vx, vy, vz, born_ms, life_ms]; `rest_y` fica fora (o cliente lê do mapa).
  defp particle(%{id: id, p0: p0, v: v, born_ms: born, life_ms: life}),
    do: [id] ++ vec(p0) ++ vec4(v) ++ [born, life]

  defp vec4({x, y, z}),
    do: [Float.round(x * 1.0, 4), Float.round(y * 1.0, 4), Float.round(z * 1.0, 4)]

  defp vec({x, y, z}), do: [r(x), r(y), r(z)]
  defp r(n), do: Float.round(n * 1.0, 3)
end
