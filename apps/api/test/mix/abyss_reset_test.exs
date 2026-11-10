defmodule Mix.Tasks.Abyss.ResetTest do
  use Abyss.DataCase, async: false

  import Swoosh.TestAssertions

  alias Abyss.Genesis
  alias Abyss.Genesis.{RateLimit, SpeciesRecord}

  setup do
    RateLimit.reset()
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  test "reset sem --yes não apaga" do
    Genesis.seed!(1, 1)
    refute Mix.Tasks.Abyss.Reset.confirmed?([])
    assert catch_exit(Mix.Tasks.Abyss.Reset.run([])) == {:shutdown, 1}
    assert Repo.aggregate(SpeciesRecord, :count, log: false) == 1
  end

  test "reset com --yes libera o e-mail" do
    assert Mix.Tasks.Abyss.Reset.confirmed?(["--yes"])
    Genesis.seed!(1, 1)
    Genesis.reset!()
    assert Repo.aggregate(SpeciesRecord, :count, log: false) == 0

    bp =
      elem(
        Abyss.Genesis.Random.blueprint(
          :rand.seed_s(:exsss, {1, 7, 7}),
          Abyss.Genesis.Catalog.get()
        ),
        0
      )

    params = %{"email" => "seed-1@seed.invalid", "name" => "Depois", "blueprint" => bp}
    assert {:ok, :sent} = Genesis.submit(params, {10, 0, 9, 1})

    assert_email_sent(fn email ->
      [_, token] = Regex.run(~r/#confirmar=([\w-]+)/, email.text_body)
      assert {:ok, %{name: "Depois"}} = Genesis.confirm(token, ip: {10, 0, 9, 2}, world: nil)
    end)
  end
end
