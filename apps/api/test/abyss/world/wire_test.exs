defmodule Abyss.World.WireTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Wire}

  @meta %{world_id: "abc", tick_hz: 10, server_ms: 1_000}

  defp sim do
    Sim.new(%{population: 20, seed: 1, radius: 18.0, y_min: 1.5, y_max: 8.0, now_ms: 5})
    |> Sim.step(0.1)
  end

  test "snapshot tem roster, espécies e bounds" do
    s = Wire.snapshot(sim(), @meta)

    assert s |> Map.keys() |> Enum.sort() ==
             Enum.sort([:world_id, :tick, :tick_hz, :server_ms, :bounds, :species, :organisms])

    assert length(s.organisms) == 20
    assert s.bounds == %{radius: 18.0, y_min: 1.5, y_max: 8.0}
    assert s.tick == 1
    assert length(s.species) == 5
    assert hd(s.species) == %{id: "membrana", code: "MBR", name: "Membrana", body_radius: 1.1}

    o = hd(s.organisms)
    assert o |> Map.keys() |> Enum.sort() == [:born_ms, :id, :p, :species, :v]
    assert is_binary(o.species) and length(o.p) == 3 and length(o.v) == 3
    assert {:ok, _} = Jason.encode(s)
  end

  test "tick segue a ordem do snapshot e arredonda a 3 casas" do
    sim = sim()
    snap = Wire.snapshot(sim, @meta)
    t = Wire.tick(sim, @meta)

    assert t |> Map.keys() |> Enum.sort() == [:o, :server_ms, :tick, :world_id]
    assert length(t.o) == length(snap.organisms)

    for {row, o} <- Enum.zip(t.o, snap.organisms) do
      assert row == o.p ++ o.v
      assert length(row) == 6
      assert Enum.all?(row, &(&1 == Float.round(&1, 3)))
    end
  end
end
