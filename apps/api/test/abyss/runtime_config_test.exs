defmodule Abyss.RuntimeConfigTest do
  # Lê config/runtime.exs com variáveis de ambiente controladas.
  use ExUnit.Case, async: false

  @vars ~w(ABYSS_SEED ABYSS_POPULATION ABYSS_TEST_SPECIES ABYSS_FOOD_BOOST)

  setup do
    saved = Map.new(@vars, &{&1, System.get_env(&1)})

    on_exit(fn ->
      for {k, v} <- saved, do: if(v, do: System.put_env(k, v), else: System.delete_env(k))
    end)

    Enum.each(@vars, &System.delete_env/1)
    :ok
  end

  defp world do
    Config.Reader.read!("config/runtime.exs", env: :test)
    |> get_in([:abyss, :world])
    |> Kernel.||([])
  end

  test "ABYSS_SEED fixa a semente do mundo" do
    System.put_env("ABYSS_SEED", "1234")
    assert Keyword.get(world(), :seed) == 1234
  end

  test "sem ABYSS_SEED (ou vazia), a semente fica a do config.exs" do
    refute Keyword.has_key?(world(), :seed)
    System.put_env("ABYSS_SEED", "")
    refute Keyword.has_key?(world(), :seed)
  end

  test "ABYSS_SEED que não é inteiro falha na partida" do
    System.put_env("ABYSS_SEED", "abc")
    assert_raise ArgumentError, fn -> world() end
  end

  test "ABYSS_FOOD_BOOST (só medição) vira food_boost; vazia ou ausente não muda nada" do
    refute Keyword.has_key?(world(), :food_boost)
    System.put_env("ABYSS_FOOD_BOOST", "")
    refute Keyword.has_key?(world(), :food_boost)
    System.put_env("ABYSS_FOOD_BOOST", "2.5")
    assert Keyword.get(world(), :food_boost) == 2.5
    System.put_env("ABYSS_FOOD_BOOST", "0")
    assert_raise RuntimeError, fn -> world() end
  end

  test "food_boost padrão é 1.0 e 1.0 devolve a comida igual" do
    assert Config.Reader.read!("config/config.exs", env: :test)
           |> get_in([:abyss, :world, :food_boost]) == 1.0

    food = Application.fetch_env!(:abyss, :food) |> Map.new()
    assert Abyss.World.Sim.boost_food(food, 1.0) == food
    boosted = Abyss.World.Sim.boost_food(food, 2.0)
    assert boosted.flora_grow_s == food.flora_grow_s / 2
    assert boosted.particle_rate == food.particle_rate * 2
    assert boosted.particle_cap == food.particle_cap * 2
  end

  test "produção começa sem organismos; dev e test com as espécies de teste" do
    species = fn env ->
      Config.Reader.read!("config/config.exs", env: env)
      |> get_in([:abyss, :world, :test_species])
    end

    assert species.(:prod) == false
    assert species.(:dev) == true
    assert species.(:test) == true
  end
end
