defmodule Abyss.World.SaverTest do
  use Abyss.DataCase, async: false

  import ExUnit.CaptureLog

  alias Abyss.World.{Saver, Server, SnapshotRecord}

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp start_saver(opts \\ []) do
    start_supervised!({Saver, Keyword.merge([name: nil], opts)})
  end

  defp start_server(saver, extra) do
    {:ok, pid} =
      Server.start_link(
        [
          name: nil,
          population: 10,
          tick_hz: 50,
          seed: 1,
          epoch: 2,
          persist: %{
            save: &Saver.save(saver, &1),
            save_sync: &Saver.save_sync(saver, &1, &2),
            flush: fn -> :ok end,
            sync: fn -> :ok end
          }
        ] ++ extra
      )

    pid
  end

  defp payload(tick) do
    sim = %{Abyss.World.Sim.new(sim_opts()) | tick: tick}
    %{sim: sim, epoch: 1, world_ms: 1_000 + tick, saved_at: DateTime.utc_now()}
  end

  defp sim_opts do
    %{
      population: 5,
      seed: 3,
      now_ms: 0,
      map: Abyss.World.Map.load!("/shared/world/map-e1.json"),
      creature_scale: 0.5,
      test_species: true,
      food: Application.fetch_env!(:abyss, :food) |> Map.new()
    }
  end

  defp count, do: Repo.aggregate(SnapshotRecord, :count, log: false)

  defp wait_until(fun, tries \\ 50) do
    cond do
      fun.() -> :ok
      tries == 0 -> flunk("condição não chegou")
      true -> Process.sleep(50) && wait_until(fun, tries - 1)
    end
  end

  test "grava a cada intervalo e guarda 3" do
    saver = start_saver()
    server = start_server(saver, snapshot_s: 0.2)
    Process.sleep(1_200)
    GenServer.stop(server, :normal)
    wait_until(fn -> not :sys.get_state(saver).busy end)

    rows = Saver.latest(5)
    assert length(rows) == 3
    ticks = Enum.map(rows, & &1.tick)
    assert ticks == Enum.sort(ticks, :desc) and hd(ticks) > 0
    [r | _] = rows
    assert r.epoch == 2 and r.checksum == Abyss.World.Snapshot.checksum(r.data)
    assert r.format_version == 1 and r.rules_version == 1
  end

  test "gravação ocupada descarta a próxima" do
    test_pid = self()

    writer = fn p ->
      send(test_pid, :writing)
      Process.sleep(300)
      Saver.write(p)
    end

    saver = start_saver(writer: writer)
    assert Saver.save(saver, payload(1)) == :ok
    assert_receive :writing, 1_000
    assert Saver.save(saver, payload(2)) == :busy
    wait_until(fn -> count() == 1 end)
    Process.sleep(100)
    assert [%{tick: 1}] = Saver.latest()
    assert Saver.save(saver, payload(3)) == :ok
    wait_until(fn -> count() == 2 end)
  end

  test "desligamento grava" do
    saver = start_saver()
    server = start_server(saver, snapshot_s: 60)
    Process.sleep(300)
    tick = Server.clock(server).tick
    Process.unlink(server)
    GenServer.stop(server, :shutdown)

    assert [r] = Saver.latest()
    assert r.tick >= tick and r.epoch == 2
  end

  test "banco fora não derruba o mundo" do
    saver = start_saver(writer: fn _ -> raise DBConnection.ConnectionError, "banco fora" end)

    log =
      capture_log(fn ->
        server = start_server(saver, snapshot_s: 0.1)
        Process.sleep(600)
        t1 = Server.clock(server).tick
        Process.sleep(200)
        assert Server.clock(server).tick > t1
        assert Process.alive?(saver)
        GenServer.stop(server, :normal)
      end)

    assert log =~ "fotografia do tick"
    refute log =~ "@"
    assert count() == 0
  end
end
