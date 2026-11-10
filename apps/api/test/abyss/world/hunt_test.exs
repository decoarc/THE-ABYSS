defmodule Abyss.World.HuntTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Grid, Hunt, Life, Organism, Species}
  alias Abyss.World.Map, as: WMap

  @eco Application.compile_env!(:abyss, :ecology) |> Map.new()
  @scale 0.5

  defp sp(id), do: Species.get!(id)

  defp org(id, species, pos, extra \\ []),
    do: struct!(%Organism{id: id, species: species, born_ms: 0, pos: pos}, extra)

  defp r(o), do: Life.radius(o, sp(o.species), @scale, @eco)

  defp grid(orgs) do
    orgs
    |> Enum.with_index(fn o, i ->
      {x, _, z} = o.pos
      {x, z, {i, o.id, o.pos, r(o), o.species, o.vel, o.energy}}
    end)
    |> Grid.build()
  end

  test "só come o que é menor" do
    fil = org("F", :filamento, {0.0, 4.0, 0.0})
    cel = org("C", :celula, {0.0, 4.0, 0.0})
    cel_j = org("J", :celula, {0.0, 4.0, 0.0}, stage: :juvenile)
    pol = org("P", :poliedro, {0.0, 4.0, 0.0})

    refute Hunt.can_eat?(sp(:filamento), r(fil), sp(:celula), r(cel))
    assert Hunt.can_eat?(sp(:filamento), r(fil), sp(:celula), r(cel_j))
    assert Hunt.can_eat?(sp(:poliedro), r(pol), sp(:filamento), r(fil))
    refute Hunt.can_eat?(sp(:celula), r(cel), sp(:celula), r(cel_j))
  end

  test "predador come menor de outra espécie" do
    pred = %{id: "sp1", diet: :predator}
    assert Hunt.can_eat?(pred, 2.0, sp(:celula), 1.0)
    refute Hunt.can_eat?(pred, 1.0, sp(:celula), 1.0)
    refute Hunt.can_eat?(pred, 1.0, sp(:celula), 2.0)
  end

  test "predador não come a própria espécie" do
    pred = %{id: "sp1", diet: :predator}
    refute Hunt.can_eat?(pred, 2.0, %{id: "sp1"}, 0.5)
    assert Hunt.can_eat?(pred, 2.0, %{id: "sp2"}, 0.5)
  end

  test "caçador de teste não come espécie criada" do
    fil = Map.put(sp(:filamento), :diet, {:prey, [:celula]})
    refute Hunt.can_eat?(fil, 5.0, %{id: "sp1"}, 0.5)
  end

  test "escape é determinístico e proporcional" do
    pairs = for i <- 1..10_000, do: {"h#{i}", "p#{i}", i * 100}
    assert Enum.all?(pairs, fn {h, p, t} -> not Hunt.escapes?(0.0, h, p, t) end)
    assert Enum.all?(pairs, fn {h, p, t} -> Hunt.escapes?(1.0, h, p, t) end)
    n = Enum.count(pairs, fn {h, p, t} -> Hunt.escapes?(0.3, h, p, t) end)
    assert_in_delta n / 10_000, 0.3, 0.02
    assert Hunt.escapes?(0.3, "a", "b", 5) == Hunt.escapes?(0.3, "a", "b", 5)
  end

  test "floresta esconde" do
    assert Hunt.perceived_range(7, 0.5) == 3.5
    assert Hunt.perceived_range(7, 0.0) == 7.0
  end

  test "cardume aproxima" do
    a = org("A", :celula, {0.0, 4.0, 0.0})
    b = org("B", :celula, {3.0, 4.0, 0.0})
    g = grid([a, b])

    {ax, ay, az} = Hunt.school_steer(a, sp(:celula), g, @eco)
    {bx, _, _} = Hunt.school_steer(b, sp(:celula), g, @eco)
    assert ax > 0 and bx < 0
    assert_in_delta ay, 0.0, 1.0e-9
    assert_in_delta az, 0.0, 1.0e-9
    assert_in_delta ax, @eco.school_weight * sp(:celula).max_speed, 1.0e-9

    # Fora de school_range: nada.
    far = org("B", :celula, {5.0, 4.0, 0.0})
    assert Hunt.school_steer(a, sp(:celula), grid([a, far]), @eco) == {0.0, 0.0, 0.0}

    c1 = org("K1", :casco, {0.0, 4.0, 0.0})
    c2 = org("K2", :casco, {3.0, 4.0, 0.0})
    assert Hunt.school_steer(c1, sp(:casco), grid([c1, c2]), @eco) == {0.0, 0.0, 0.0}
  end

  test "ameaça é o caçador mais próximo que pode comer" do
    bounds = %{species: Map.new(Species.all(), &{&1.id, &1}), shelters: []}
    prey = org("J", :celula, {0.0, 4.0, 0.0}, stage: :juvenile)
    near = org("F1", :filamento, {3.0, 4.0, 0.0})
    farther = org("F2", :filamento, {-4.0, 4.0, 0.0})
    harmless = org("K", :casco, {1.5, 4.0, 0.0})
    g = grid([prey, near, farther, harmless])

    assert Hunt.threat(prey, sp(:celula), r(prey), g, bounds) == {3.0, 4.0, 0.0}

    # Adulta é maior que o Filamento: nenhuma ameaça.
    adult = %{prey | stage: :adult}
    assert Hunt.threat(adult, sp(:celula), r(adult), grid([adult, near, farther]), bounds) == nil

    # Fora de perception: nada.
    out = org("F3", :filamento, {6.5, 4.0, 0.0})
    assert Hunt.threat(prey, sp(:celula), r(prey), grid([prey, out]), bounds) == nil
  end

  test "foge da ameaça e, com abrigo, puxa para a cobertura" do
    map = WMap.load!("/shared/world/map-e1.json")
    # Um abrigo a +z (cover 0,5) e outro, mais longe, a −z.
    regions = [
      %{
        id: :aberto,
        center: {0, 0},
        radius: 30,
        flora_patches: 0,
        particle_share: 0.0,
        cover: 0.0
      },
      %{
        id: :abrigo,
        center: {0, 40},
        radius: 10,
        flora_patches: 0,
        particle_share: 0.0,
        cover: 0.5
      },
      %{
        id: :longe,
        center: {0, -80},
        radius: 10,
        flora_patches: 0,
        particle_share: 0.0,
        cover: 0.5
      }
    ]

    bounds = %{map: %{map | regions: regions}, shelters: [{0, 40}, {0, -80}]}
    s = sp(:celula)
    speed = s.max_speed * s.burst
    o = org("J", :celula, {0.0, 4.0, 0.0}, stage: :juvenile)

    {x, y, z} = Hunt.flee_steer(o, %{s | shelter: false}, {3.0, 4.0, 0.0}, bounds)
    assert_in_delta x, -speed, 1.0e-9
    assert_in_delta y, 0.0, 1.0e-9
    assert_in_delta z, 0.0, 1.0e-9

    {x, _, z} = Hunt.flee_steer(o, s, {3.0, 4.0, 0.0}, bounds)
    assert_in_delta x, -speed / :math.sqrt(2), 1.0e-9
    assert_in_delta z, speed / :math.sqrt(2), 1.0e-9

    # Já dentro da cobertura: só se afasta.
    inside = org("J", :celula, {0.0, 4.0, 42.0}, stage: :juvenile)
    {x, _, z} = Hunt.flee_steer(inside, s, {3.0, 4.0, 42.0}, bounds)
    assert_in_delta x, -speed, 1.0e-9
    assert_in_delta z, 0.0, 1.0e-9
  end
end
