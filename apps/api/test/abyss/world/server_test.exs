defmodule Abyss.World.ServerTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Observers, Server}

  defp start_server(extra \\ []) do
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

  test "emite ticks crescentes com o mesmo world_id" do
    start_server()
    assert_receive {:tick, a}, 2000
    assert_receive {:tick, b}, 2000
    assert_receive {:tick, c}, 2000
    assert a.tick < b.tick and b.tick < c.tick
    assert a.world_id == b.world_id and b.world_id == c.world_id
  end

  test "ticks e snapshot carregam a comida" do
    pid = start_server()
    assert_receive {:tick, t}, 2000
    assert is_list(t.f) and is_list(t.ps) and is_list(t.pr)
    snap = Server.snapshot(pid)
    assert length(snap.flora) == 200 and is_list(snap.particles)
  end

  test "snapshot coerente com o tick seguinte" do
    pid = start_server()
    assert_receive {:tick, _}, 2000
    snap = Server.snapshot(pid)
    assert_receive {:tick, next}, 2000
    # descarta ticks já enfileirados antes do snapshot
    next = drain_until(next, snap.tick)
    assert snap.world_id == next.world_id
    assert snap.tick < next.tick
    assert length(snap.organisms) == 10
  end

  test "stats mede jitter" do
    pid = start_server()
    Process.sleep(1000)
    st = Server.stats(pid)
    assert st.tick > 0
    assert is_number(st.jitter_ms_p99) and st.jitter_ms_p99 >= 0
    assert is_number(st.jitter_ms_p50) and st.step_us_max >= 0

    for k <-
          ~w(flora_patches flora_level_sum particles eaten_flora_total eaten_particles_total particles_expired_total)a,
        do: assert(is_number(st[k]), "falta #{k}")

    assert st.flora_patches == 200
    assert st.population == 10 and st.tick_hz == 50 and st.uptime_ms >= 0
  end

  test "Observers conta e esquece pids mortos" do
    base = Observers.count()
    pid = spawn(fn -> Process.sleep(:infinity) end)
    assert :ok = Observers.track(pid)
    assert Observers.count() == base + 1
    Process.exit(pid, :kill)
    Process.sleep(100)
    assert Observers.count() == base
  end

  test "add_species chega aos observadores" do
    pid = start_server()
    assert_receive {:tick, _}, 2000
    assert :ok = Server.add_species(pid, made(1))
    sp_tick = wait_tick(fn t -> t.sp != [] end)
    assert [%{id: "sp1"}] = sp_tick.sp
    assert sp_tick.b |> Enum.count(&(&1.species == "sp1")) == 3
    assert Enum.any?(Server.snapshot(pid).species, &(&1.id == "sp1"))
  end

  test "species_loader no boot" do
    loader = fn -> %{live: [made(1), made(2)], extinct: [{made(3), 555}]} end
    pid = start_server(species_loader: loader, population: 0, test_species: false)
    assert_receive {:tick, t}, 2000
    assert length(t.sp) == 3
    assert length(t.b) == 6
    snap = Server.snapshot(pid)
    assert length(snap.organisms) == 6
    assert Enum.find(snap.species, &(&1.id == "sp3")).extinct_ms == 555
    assert Enum.find(snap.species, &(&1.id == "sp1")).extinct_ms == nil
  end

  test "on_extinct só com criadas" do
    test_pid = self()
    cb = fn list -> send(test_pid, {:extinct, list}) end
    # 2 espécies criadas sem organismos reais: fundadoras zero via loader não bastam;
    # uma criada com 3 fundadoras que morrem de fome, uma de teste extinta
    sp = %{made(1) | energy_max: 0.001}
    start_server(on_extinct: cb, species_loader: fn -> %{live: [sp], extinct: []} end)
    assert_receive {:extinct, [{"sp1", ms}]}, 5000
    assert is_integer(ms)
    Process.sleep(300)
    assert all_binary_ids?()
  end

  test "on_extinct que explode não derruba o mundo" do
    sp = %{made(1) | energy_max: 0.001}

    pid =
      start_server(
        on_extinct: fn _ -> raise "boom" end,
        species_loader: fn -> %{live: [sp], extinct: []} end
      )

    assert_receive {:tick, _}, 2000
    Process.sleep(300)
    assert Process.alive?(pid)
    assert Server.stats(pid).tick > 3
  end

  defp all_binary_ids? do
    receive do
      {:extinct, list} -> Enum.all?(list, fn {id, _} -> is_binary(id) end) and all_binary_ids?()
    after
      0 -> true
    end
  end

  defp wait_tick(pred) do
    assert_receive {:tick, t}, 2000
    if pred.(t), do: t, else: wait_tick(pred)
  end

  defp drain_until(msg, tick) when msg.tick > tick, do: msg

  defp drain_until(_msg, tick) do
    assert_receive {:tick, m}, 2000
    drain_until(m, tick)
  end
end
