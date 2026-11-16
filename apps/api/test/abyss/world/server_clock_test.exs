defmodule Abyss.World.ServerClockTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Server, Sim}

  @hour 3_600_000

  defp start_server(extra) do
    test_pid = self()

    {:ok, pid} =
      Server.start_link(
        [
          name: nil,
          population: 10,
          tick_hz: 50,
          seed: 1,
          broadcast: &send(test_pid, {:tick, &1})
        ] ++ extra
      )

    pid
  end

  defp made(i) do
    cat = Abyss.Genesis.Catalog.get()
    {bp, _} = Abyss.Genesis.Random.blueprint(:rand.seed_s(:exsss, i), cat)
    Abyss.Genesis.Traits.species(bp, cat, %{id: "sp#{i}", code: "S#{i}", name: "G#{i}"})
  end

  test "offset atrasa o relógio do mundo" do
    pid = start_server(clock_offset_ms: @hour)
    snap = Server.snapshot(pid)
    assert_in_delta snap.server_ms, System.system_time(:millisecond) - @hour, 1_000

    clock = Server.clock(pid)
    assert clock.offset_ms == @hour and clock.epoch == 1
    assert_in_delta clock.world_ms, System.system_time(:millisecond) - @hour, 1_000
    assert is_integer(clock.tick)
  end

  test "extinção chega em hora real com causa" do
    test_pid = self()

    step = fn sim, dt, ms ->
      sim = Sim.step(sim, dt, ms)

      if sim.tick == 2 do
        %{
          sim
          | life_events: %{
              sim.life_events
              | extinct: [{"sp1", ms}, {:celula, ms}],
                extinct_causes: %{"sp1" => {:predation, "sp2"}, celula: {:starvation, nil}}
            }
        }
      else
        sim
      end
    end

    start_server(
      clock_offset_ms: @hour,
      epoch: 4,
      step: step,
      on_extinct: &send(test_pid, {:extinct, &1})
    )

    assert_receive {:extinct, [ev]}, 2000
    assert %{id: "sp1", cause: :predation, predator: "sp2", epoch: 4} = ev
    assert ev.at_ms == ev.world_ms + @hour
    assert_in_delta ev.at_ms, System.system_time(:millisecond), 1_000
  end

  test "espécie carregada converte para o relógio do mundo" do
    real = System.system_time(:millisecond) - 10_000
    branch = Map.merge(made(1), %{id: "sp1.1", parent: "sp1", root: "sp1", born_ms: real})
    root = Map.merge(made(1), %{parent: nil, root: "sp1", born_ms: real - 5_000})
    dead = Map.merge(made(2), %{parent: nil, root: "sp2", born_ms: real - 9_000})

    pid =
      start_server(
        clock_offset_ms: @hour,
        population: 0,
        test_species: false,
        species_loader: fn -> %{live: [root, branch], extinct: [{dead, real}]} end
      )

    sim = :sys.get_state(pid).sim
    assert sim.bounds.species["sp1.1"].born_ms == real - @hour
    assert sim.extinct["sp2"] == real - @hour

    snap = Server.snapshot(pid)
    assert Enum.find(snap.species, &(&1.id == "sp1.1")).born_ms == real
    assert Enum.find(snap.species, &(&1.id == "sp2")).extinct_ms == real
  end

  test "ramo nascido sai em hora real" do
    test_pid = self()
    branch = Map.merge(made(1), %{id: "sp1.1", parent: "sp1", root: "sp1", born_ms: 0})

    step = fn sim, dt, ms ->
      sim = Sim.step(sim, dt, ms)

      if sim.tick == 2,
        do: %{sim | life_events: %{sim.life_events | branches: [%{branch | born_ms: ms}]}},
        else: sim
    end

    start_server(clock_offset_ms: @hour, step: step, on_branch: &send(test_pid, {:branch, &1}))
    assert_receive {:branch, [sp]}, 2000
    assert_in_delta sp.born_ms, System.system_time(:millisecond), 1_000
  end

  test "on_deaths só com criadas" do
    test_pid = self()

    step = fn sim, dt, ms ->
      sim = Sim.step(sim, dt, ms)

      dead_by =
        if sim.tick == 2,
          do: [{:celula, :starvation, nil}, {"sp3", :predation, :filamento}],
          else: []

      %{sim | life_events: %{sim.life_events | dead_by: dead_by}}
    end

    start_server(
      clock_offset_ms: @hour,
      epoch: 2,
      step: step,
      on_deaths: fn list, w, tick, epoch -> send(test_pid, {:deaths, list, w, tick, epoch}) end
    )

    assert_receive {:deaths, list, w, 2, 2}, 2000
    assert list == [{"sp3", :predation, :filamento}]
    assert_in_delta w, System.system_time(:millisecond) - @hour, 1_000
    refute_receive {:deaths, _, _, _, _}, 200
  end
end
