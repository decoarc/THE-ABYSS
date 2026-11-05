defmodule Abyss.RuntimeConfigTest do
  # Lê config/runtime.exs com variáveis de ambiente controladas.
  use ExUnit.Case, async: false

  @vars ~w(ABYSS_SEED ABYSS_POPULATION ABYSS_TEST_SPECIES)

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
