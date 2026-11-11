defmodule Abyss.Genesis.ConfirmTest do
  use Abyss.DataCase, async: false

  import Swoosh.TestAssertions

  alias Abyss.Genesis
  alias Abyss.Genesis.{RateLimit, SpeciesRecord, VerificationToken}
  alias Abyss.World.Server

  @ip {10, 0, 0, 1}

  setup do
    RateLimit.reset()
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    {:ok, world} =
      Server.start_link(
        name: nil,
        population: 5,
        test_species: false,
        tick_hz: 50,
        seed: 1,
        broadcast: fn _ -> :ok end
      )

    {:ok, world: world}
  end

  defp part(kind) do
    %{
      "kind" => kind,
      "at" => 0.5,
      "around" => 0.0,
      "size" => 1.0,
      "angle" => 0.0,
      "mirror" => false
    }
  end

  defp blueprint do
    %{
      "v" => 1,
      "body" => %{"spine" => [[-0.3, 0.0, 0.35], [0.0, 0.0, 0.45], [0.3, 0.0, 0.35]]},
      "parts" => [part("raspador")],
      "colors" => %{"glow" => "#7fe9dd", "body" => "#3f5a4a"},
      "pattern" => "manchas"
    }
  end

  defp params(email), do: %{"email" => email, "name" => "Lumina", "blueprint" => blueprint()}

  # Envia e devolve o token do link do e-mail.
  defp submit_token(email, ip \\ @ip) do
    assert {:ok, :sent} = Genesis.submit(params(email), ip)

    token_from_mailbox()
  end

  defp token_from_mailbox do
    receive do
      {:email, email} ->
        [_, token] = Regex.run(~r{#confirmar=([A-Za-z0-9_-]+)}, email.text_body)
        token
    after
      500 -> flunk("nenhum e-mail")
    end
  end

  defp wait_for(fun, tries \\ 100) do
    cond do
      fun.() -> :ok
      tries == 0 -> flunk("condição não atingida")
      true -> Process.sleep(20) && wait_for(fun, tries - 1)
    end
  end

  test "confirmar publica e faz nascer 3", %{world: world} do
    token = submit_token("ana@x.com")

    assert {:ok, %{id: "sp" <> _ = id, name: "Lumina", code: code}} =
             Genesis.confirm(token, world: world)

    assert code =~ ~r/^S[0-9A-Z]{2,}$/
    assert [%{code: ^code}] = Repo.all(SpeciesRecord)

    wait_for(fn ->
      Enum.count(Server.snapshot(world).organisms, &(&1.species == id)) == 3
    end)
  end

  test "token vencido, desconhecido ou usado dá :invalid", %{world: world} do
    assert {:error, :invalid} = Genesis.confirm("desconhecido", world: world)
    assert {:error, :invalid} = Genesis.confirm(nil, world: world)
    assert {:error, :invalid} = Genesis.confirm(<<255, 254>>, world: world)

    token = submit_token("ana@x.com")

    Repo.update_all(VerificationToken,
      set: [expires_at: DateTime.add(DateTime.utc_now(), -5, :second)]
    )

    assert {:error, :invalid} = Genesis.confirm(token, world: world)

    token2 = submit_token("bia@x.com")
    assert {:ok, _} = Genesis.confirm(token2, world: world)
    assert {:error, :invalid} = Genesis.confirm(token2, world: world)
  end

  test "mesmo token em paralelo publica uma vez", %{world: world} do
    token = submit_token("ana@x.com")

    results =
      for _ <- 1..2, do: Task.async(fn -> Genesis.confirm(token, world: world) end)

    results = Enum.map(results, &Task.await/1)
    assert Enum.count(results, &match?({:ok, _}, &1)) == 1
    assert Enum.count(results, &(&1 == {:error, :invalid})) == 1
    assert Repo.aggregate(SpeciesRecord, :count) == 1
  end

  test "dois tokens do mesmo e-mail publicam uma vez", %{world: world} do
    t1 = submit_token("ana@x.com", {1, 1, 1, 1})

    # segundo token do mesmo e-mail, criado à mão (o envio já o recusaria)
    Repo.insert!(%VerificationToken{
      token_hash: :crypto.hash(:sha256, "segundo"),
      email_normalized: "ana@x.com",
      name: "Outra",
      blueprint: blueprint(),
      expires_at: DateTime.add(DateTime.utc_now(), 600, :second)
    })

    # Em sequência é determinístico: o primeiro publica e apaga os tokens do
    # e-mail; o segundo, já apagado, é :invalid. (O :taken, sem a limpeza, é o
    # teste "maiúsculas e espaços".)
    assert {:ok, _} = Genesis.confirm(t1, world: world)
    assert {:error, :invalid} = Genesis.confirm("segundo", world: world)
    assert Repo.aggregate(SpeciesRecord, :count) == 1
    assert Repo.all(VerificationToken) == []
  end

  test "maiúsculas e espaços são o mesmo e-mail", %{world: world} do
    t1 = submit_token(" Ana@X.com")
    assert {:ok, _} = Genesis.confirm(t1, world: world)

    # outro token do mesmo e-mail (já normalizado) que sobrou: dá :taken
    Repo.insert!(%VerificationToken{
      token_hash: :crypto.hash(:sha256, "sobra"),
      email_normalized: "ana@x.com",
      name: "Outra",
      blueprint: blueprint(),
      expires_at: DateTime.add(DateTime.utc_now(), 600, :second)
    })

    assert {:error, :taken} = Genesis.confirm("sobra", world: world)

    # e um novo envio com outra grafia nem gera token
    assert {:ok, :sent} = Genesis.submit(params("ana@x.com "), {1, 1, 1, 2})
    assert Repo.all(VerificationToken) |> Enum.map(& &1.name) == ["Outra"]
  end

  test "extinção não libera o e-mail", %{world: world} do
    token = submit_token("ana@x.com")
    assert {:ok, _} = Genesis.confirm(token, world: world)
    Repo.update_all(SpeciesRecord, set: [extinct_at: DateTime.utc_now()])

    assert {:ok, :sent} = Genesis.submit(params("ana@x.com"), @ip)
    assert_email_sent(fn email -> assert email.text_body =~ "já criou uma espécie" end)
    assert Repo.all(VerificationToken) == []
  end

  test "sem mundo rodando a confirmação ainda vale" do
    token = submit_token("ana@x.com")
    assert {:ok, _} = Genesis.confirm(token, world: :nao_existe)
    assert Repo.aggregate(SpeciesRecord, :count) == 1
  end

  test "limite de confirmações por rede", %{world: world} do
    for _ <- 1..20, do: assert({:error, :invalid} = Genesis.confirm("x", world: world, ip: @ip))
    assert {:error, :rate_limited} = Genesis.confirm("x", world: world, ip: @ip)
  end

  test "species_from_record reconstrói a espécie" do
    rec = %SpeciesRecord{id: 7, code: "S07", name: "Lumina", blueprint: blueprint()}
    sp = Genesis.species_from_record(rec)
    assert sp.id == "sp7" and sp.code == "S07" and sp.name == "Lumina"
  end

  test "submit com tipos hostis nunca levanta" do
    for bad <- [
          "texto",
          42,
          nil,
          %{"email" => 1, "name" => 2, "blueprint" => 3},
          %{"email" => ["a@b.com"], "name" => ["x"]},
          %{"email" => <<255, 254, ?@, ?a, ?.>>, "name" => <<255>>, "blueprint" => []}
        ] do
      assert r = Genesis.submit(bad, @ip)
      assert match?({:error, _}, r)
    end
  end
end
