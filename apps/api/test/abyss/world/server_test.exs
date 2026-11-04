defmodule Abyss.World.ServerTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Observers, Server}

  defp start_server do
    test_pid = self()

    {:ok, pid} =
      Server.start_link(
        name: nil,
        population: 10,
        tick_hz: 50,
        seed: 1,
        broadcast: &send(test_pid, {:tick, &1})
      )

    pid
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

  defp drain_until(msg, tick) when msg.tick > tick, do: msg

  defp drain_until(_msg, tick) do
    assert_receive {:tick, m}, 2000
    drain_until(m, tick)
  end
end
