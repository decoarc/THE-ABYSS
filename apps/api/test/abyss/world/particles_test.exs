defmodule Abyss.World.ParticlesTest do
  use ExUnit.Case, async: true

  alias Abyss.World.Particles
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @cfg Application.compile_env!(:abyss, :food) |> Map.new()

  defp rng, do: :rand.seed_s(:exsss, 3)

  # Um passo de 1 s por segundo simulado; devolve {p, rng, spawned, removed}.
  defp run(p, rng, seconds) do
    Enum.reduce(1..seconds, {p, rng, [], []}, fn t, {p, rng, sp, rm} ->
      {p, s, r, rng} = Particles.step(p, 1.0, t * 1000, rng)
      {p, rng, sp ++ s, rm ++ r}
    end)
  end

  # Uma única partícula nascida em now=0, com taxa enorme e teto 1.
  defp single do
    p = Particles.new(@map, %{@cfg | particle_rate: 1000.0, particle_cap: 1})
    {p, [pt], [], rng} = Particles.step(p, 1.0, 0, rng())
    {p, pt, rng}
  end

  test "nunca passa do teto" do
    p = Particles.new(@map, %{@cfg | particle_rate: 10.0})

    Enum.reduce(1..2000, {p, rng()}, fn t, {p, rng} ->
      {p, _, _, rng} = Particles.step(p, 1.0, t * 1000, rng)
      assert Particles.count(p) <= 400
      {p, rng}
    end)
  end

  test "nascem mais na Planície" do
    {_, _, spawned, _} = run(Particles.new(@map, @cfg), rng(), 2000)
    assert length(spawned) > 1000

    in_planicie =
      Enum.count(spawned, fn %{p0: {x, _, z}} -> WMap.region_at(@map, x, z) == :planicie end)

    assert_in_delta in_planicie / length(spawned), 0.8, 0.1
  end

  test "nascem em y_max + 2, com velocidade dentro da faixa e ids crescentes" do
    {_, _, spawned, _} = run(Particles.new(@map, @cfg), rng(), 200)
    assert spawned != []
    assert Enum.all?(spawned, fn %{p0: {_, y, _}} -> y == @map.y_max + 2 end)

    for %{v: {vx, vy, vz}} <- spawned do
      assert -0.3 <= vy and vy <= -0.15
      assert :math.sqrt(vx * vx + vz * vz) <= 0.05 + 1.0e-12
    end

    ids = Enum.map(spawned, & &1.id)
    assert ids == Enum.sort(ids) and ids == Enum.uniq(ids)
  end

  test "caem e repousam" do
    {_, pt, _} = single()
    {_, y0, _} = Particles.position(pt, pt.born_ms)
    assert y0 == @map.y_max + 2
    {_, ym, _} = Particles.position(pt, pt.born_ms + 1000)
    assert ym < y0

    late = Particles.position(pt, pt.born_ms + 1_000_000)
    assert elem(late, 1) == @map.particle_rest_y
    assert Particles.position(pt, pt.born_ms + 2_000_000) == late
  end

  test "expiram" do
    {p, pt, rng} = single()
    assert pt.life_ms == 180_000
    {p, _, removed, rng} = Particles.step(p, 1.0, pt.life_ms - 1, rng)
    refute pt.id in removed
    {p, _, removed, _} = Particles.step(p, 1.0, pt.life_ms, rng)
    assert pt.id in removed
    refute Map.has_key?(p.items, pt.id)
  end

  test "take remove uma vez" do
    {p, pt, _} = single()
    assert {p, true} = Particles.take(p, pt.id)
    assert Particles.count(p) == 0
    assert {_, false} = Particles.take(p, pt.id)
  end

  test "near devolve a mais próxima, com y limitado a y_min" do
    {p, pt, _} = single()
    now = 1_000_000
    {x, y, z} = Particles.position(pt, now)
    assert y == @map.particle_rest_y
    assert Particles.near(p, {x, @map.y_min, z}, 0.5, now) == pt.id
    assert Particles.near(p, {x, 0.0, z}, 0.5, now) == pt.id
    assert Particles.near(p, {x + 10, @map.y_min, z}, 0.5, now) == nil
  end

  test "determinística pelo RNG" do
    a = run(Particles.new(@map, @cfg), rng(), 50)
    b = run(Particles.new(@map, @cfg), rng(), 50)
    assert a == b
  end
end
