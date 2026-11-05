defmodule Abyss.World.WireTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Wire}

  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @busy %{@food | particle_rate: 50.0, particle_life_s: 0.05}
  @meta %{world_id: "abc", tick_hz: 10, server_ms: 1_000}

  defp sim(food \\ @food) do
    Sim.new(%{
      population: 20,
      seed: 1,
      now_ms: 5,
      map: Abyss.World.Map.load!("/shared/world/map-e1.json"),
      creature_scale: 0.5,
      test_species: true,
      food: food
    })
    |> Sim.step(0.1)
  end

  test "snapshot tem roster, espécies e bounds" do
    s = Wire.snapshot(sim(), @meta)

    assert s |> Map.keys() |> Enum.sort() ==
             Enum.sort([
               :world_id,
               :tick,
               :tick_hz,
               :server_ms,
               :map_id,
               :creature_scale,
               :bounds,
               :species,
               :organisms,
               :flora,
               :particles
             ])

    assert length(s.organisms) == 20
    assert s.bounds == %{y_min: 1.5, y_max: 8.0}
    assert s.map_id == "e1"
    assert s.creature_scale == 0.5
    assert s.tick == 1
    assert length(s.species) == 5
    assert length(s.flora) == 200

    assert Enum.all?(s.flora, fn [x, z, l] ->
             is_number(x) and is_number(z) and l >= 0 and l <= 1
           end)

    assert is_list(s.particles) and Enum.all?(s.particles, &(length(&1) == 9))
    assert hd(s.species) == %{id: "membrana", code: "MBR", name: "Membrana", body_radius: 0.55}

    o = hd(s.organisms)
    assert o |> Map.keys() |> Enum.sort() == [:born_ms, :id, :p, :species, :v]
    assert is_binary(o.species) and length(o.p) == 3 and length(o.v) == 3
    assert {:ok, _} = Jason.encode(s)
  end

  test "tick segue a ordem do snapshot e arredonda a 3 casas" do
    sim = sim()
    snap = Wire.snapshot(sim, @meta)
    t = Wire.tick(sim, @meta)

    assert t |> Map.keys() |> Enum.sort() == [:f, :o, :pr, :ps, :server_ms, :tick, :world_id]
    assert length(t.o) == length(snap.organisms)

    for {row, o} <- Enum.zip(t.o, snap.organisms) do
      assert row == o.p ++ o.v
      assert length(row) == 6
      assert Enum.all?(row, &(&1 == Float.round(&1, 3)))
    end
  end

  test "ps, pr e f batem com os eventos do passo" do
    s1 = sim(@busy)
    s2 = Sim.step(s1, 0.1)

    t1 = Wire.tick(s1, @meta)
    assert t1.ps != []
    assert Enum.map(t1.ps, &hd/1) == Enum.map(s1.food_events.spawned, & &1.id)
    assert Enum.all?(t1.ps, &(length(&1) == 9))
    assert t1.pr == []

    # as nascidas no passo 1 expiram (vida de 50 ms) no passo 2
    t2 = Wire.tick(s2, @meta)
    assert t2.pr == Enum.sort(Enum.map(t1.ps, &hd/1))
    assert t2.pr == s2.food_events.removed
    assert Enum.all?(t2.pr, &is_integer/1)

    for s <- [s1, s2] do
      assert Wire.tick(s, @meta).f == for({i, l} <- s.food_events.changed, do: [i, l])
      assert length(s.food_events.changed) < 200
    end

    snap = Wire.snapshot(s2, @meta)
    assert Enum.map(snap.particles, &hd/1) == Enum.sort(Enum.map(s2.food_events.spawned, & &1.id))
    assert Enum.all?(snap.particles, &(length(&1) == 9))
    assert {:ok, _} = Jason.encode(snap)
    assert {:ok, _} = Jason.encode(t2)
  end

  test "f só traz manchas cujo nível quantizado mudou" do
    {sim, seen} =
      Enum.reduce(1..60, {sim(), []}, fn _, {s, seen} ->
        s = Sim.step(s, 0.1)
        {s, seen ++ Wire.tick(s, @meta).f}
      end)

    assert seen != []
    assert Enum.all?(seen, fn [idx, l] -> idx in 0..199 and l == Float.round(l, 2) end)
    assert length(Wire.snapshot(sim, @meta).flora) == 200
  end
end
