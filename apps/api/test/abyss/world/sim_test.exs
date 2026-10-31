defmodule Abyss.World.SimTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Species}

  @opts %{population: 45, seed: 7, radius: 18.0, y_min: 1.5, y_max: 8.0, now_ms: 0}

  defp run(sim, n), do: Enum.reduce(1..n, sim, fn _, s -> Sim.step(s, 0.1) end)
  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist({a, b, c}, {d, e, f}), do: norm({a - d, b - e, c - f})
  defp count(sim, sp), do: Enum.count(sim.organisms, &(&1.species == sp))
  defp max_speed(sp), do: Enum.find(Species.all(), &(&1.id == sp)).max_speed

  test "distribui a população pelas espécies" do
    sim = Sim.new(@opts)
    assert Enum.all?(Species.all(), &(count(sim, &1.id) == 9))

    mbr = sim.organisms |> Enum.filter(&(&1.species == :membrana)) |> Enum.map(& &1.id)
    assert mbr == for(i <- 1..9, do: "MBR-" <> String.pad_leading("#{i}", 4, "0"))

    sim = Sim.new(%{@opts | population: 47})
    assert Enum.map(Species.all(), &count(sim, &1.id)) == [10, 10, 9, 9, 9]
  end

  test "rejeita população fora de 5..200" do
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 4}) end
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 201}) end
  end

  test "é determinístico pela seed" do
    a = @opts |> Sim.new() |> run(100)
    b = @opts |> Sim.new() |> run(100)
    assert a == b
    c = %{@opts | seed: 8} |> Sim.new() |> run(100)
    refute Enum.map(a.organisms, & &1.pos) == Enum.map(c.organisms, & &1.pos)
    assert a.tick == 100
  end

  test "todos ficam no volume" do
    sim = run(Sim.new(@opts), 3000)

    for o <- sim.organisms do
      {x, y, z} = o.pos
      assert x * x + z * z <= 18.0 * 18.0 + 1.0e-9
      assert y >= 1.5 and y <= 8.0
      assert x == x and y == y and z == z
    end
  end

  test "respeita max_speed" do
    Enum.reduce(1..300, Sim.new(@opts), fn _, s ->
      s = Sim.step(s, 0.1)
      for o <- s.organisms, do: assert(norm(o.vel) <= max_speed(o.species) * 1.001)
      s
    end)
  end

  test "evita sobreposição" do
    sim = run(Sim.new(@opts), 600)
    rad = Map.new(Species.all(), &{&1.id, &1.body_radius})

    for a <- sim.organisms, b <- sim.organisms, a.id < b.id do
      assert dist(a.pos, b.pos) >= 0.5 * (rad[a.species] + rad[b.species])
    end
  end

  test "cada espécie mantém seu ritmo" do
    # deslocamento = distância percorrida (soma dos passos): o líquido do Filamento
    # é diluído pelo seu vagar errático, o que não diz nada sobre o ritmo.
    {_, path} =
      Enum.reduce(1..600, {Sim.new(@opts), %{}}, fn _, {s, acc} ->
        s2 = Sim.step(s, 0.1)

        acc =
          Enum.zip(s.organisms, s2.organisms)
          |> Enum.reduce(acc, fn {a, b}, m ->
            Map.update(m, a.id, dist(a.pos, b.pos), &(&1 + dist(a.pos, b.pos)))
          end)

        {s2, acc}
      end)

    mean = fn prefix ->
      d = for {id, v} <- path, String.starts_with?(id, prefix), do: v
      Enum.sum(d) / length(d)
    end

    assert mean.("FIL") > 5 * mean.("CAS")
  end

  test "Célula pausa e volta" do
    paused =
      Enum.reduce(1..300, {Sim.new(@opts), false}, fn _, {s, hit} ->
        s = Sim.step(s, 0.1)

        hit =
          hit or
            Enum.any?(
              s.organisms,
              &(&1.species == :celula and &1.mode == :pause and norm(&1.vel) < 0.05)
            )

        {s, hit}
      end)
      |> elem(1)

    assert paused
  end

  describe "zona livre da câmera" do
    @cam {0.0, 8.2, 17.5}
    @wide %{
      population: 45,
      seed: 7,
      radius: 28.0,
      y_min: 1.5,
      y_max: 8.0,
      now_ms: 0,
      exclusion: %{center: {0.0, 8.2, 17.5}, radius: 10.0}
    }
    @body Map.new(Species.all(), &{&1.id, &1.body_radius})

    defp outside?(sim) do
      Enum.all?(sim.organisms, &(dist(&1.pos, @cam) >= 10.0 + @body[&1.species] - 1.0e-9))
    end

    test "ninguém nasce na zona da câmera" do
      for seed <- 1..20, do: assert(outside?(Sim.new(%{@wide | seed: seed})))
    end

    test "ninguém entra na zona da câmera" do
      Enum.reduce(1..3000, Sim.new(@wide), fn _, s ->
        s = Sim.step(s, 0.1)
        assert outside?(s)
        s
      end)
    end

    test "volume de raio 28" do
      sim = run(Sim.new(@wide), 3000)

      for o <- sim.organisms do
        {x, _y, z} = o.pos
        assert x * x + z * z <= 28.0 * 28.0 + 1.0e-9
      end
    end
  end
end
