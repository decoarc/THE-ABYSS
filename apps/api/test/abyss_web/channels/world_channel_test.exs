defmodule AbyssWeb.WorldChannelTest do
  use AbyssWeb.ChannelCase, async: false

  alias Abyss.World.{Observers, Server}

  setup do
    start_supervised!(
      {Server,
       population: 45,
       tick_hz: 20,
       seed: 1,
       broadcast: &AbyssWeb.Endpoint.broadcast!("world:main", "tick", &1)}
    )

    {:ok, socket: socket(AbyssWeb.WorldSocket)}
  end

  defp join_main(socket),
    do: subscribe_and_join(socket, AbyssWeb.WorldChannel, "world:main")

  test "join devolve snapshot", %{socket: socket} do
    {:ok, reply, _} = join_main(socket)
    assert is_binary(reply.world_id)
    assert length(reply.organisms) == 45
    assert is_number(reply.juvenile_scale)
  end

  test "recebe ticks do mesmo mundo", %{socket: socket} do
    {:ok, %{world_id: id}, _} = join_main(socket)
    assert_push "tick", %{world_id: ^id, o: o}, 2000
    assert length(o) == 45
  end

  test "rejeita outros mundos", %{socket: socket} do
    assert {:error, %{reason: "unknown_world"}} =
             subscribe_and_join(socket, AbyssWeb.WorldChannel, "world:outro")
  end

  test "canal é só leitura", %{socket: socket} do
    {:ok, _, socket} = join_main(socket)
    ref = push(socket, "move", %{})
    assert_reply ref, :error, %{reason: "read_only"}
  end

  test "conta observadores", %{socket: socket} do
    {:ok, _, _} = join_main(socket)
    assert Observers.count() == 1
  end
end
