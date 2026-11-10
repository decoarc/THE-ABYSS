defmodule Abyss.Genesis.SubmitTest do
  use Abyss.DataCase, async: false

  import Swoosh.TestAssertions

  alias Abyss.Genesis
  alias Abyss.Genesis.{Creator, RateLimit, SpeciesRecord, VerificationToken}

  @ip {10, 0, 0, 1}

  setup do
    RateLimit.reset()
    :ok
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

  defp params(email, extra \\ %{}) do
    Map.merge(%{"email" => email, "name" => "Lumina", "blueprint" => blueprint()}, extra)
  end

  test "envia link com token que só existe como hash" do
    assert {:ok, :sent} = Genesis.submit(params("Ana@Exemplo.com"), @ip)

    assert_email_sent(fn email ->
      [_, token] =
        Regex.run(~r{http://localhost:5173/#confirmar=([A-Za-z0-9_-]+)}, email.text_body)

      assert byte_size(Base.url_decode64!(token, padding: false)) == 32
      assert email.subject == "Confirme a sua espécie no The Abyss"

      [row] = Repo.all(VerificationToken)
      assert row.token_hash == :crypto.hash(:sha256, token)
      assert row.email_normalized == "ana@exemplo.com"
      refute token in [row.name, row.email_normalized, Base.encode64(row.token_hash)]
      assert DateTime.diff(row.expires_at, DateTime.utc_now()) in 1790..1800
    end)
  end

  test "e-mail já usado recebe resposta igual" do
    c = Repo.insert!(%Creator{email_normalized: "ana@exemplo.com"})

    Repo.insert!(%SpeciesRecord{
      creator_id: c.id,
      name: "X",
      code: "AAAA",
      blueprint: %{},
      ruleset: "s1",
      published_at: DateTime.utc_now()
    })

    assert {:ok, :sent} = Genesis.submit(params(" ANA@exemplo.com "), @ip)
    assert_email_sent(fn email -> assert email.text_body =~ "já criou uma espécie" end)
    assert Repo.all(VerificationToken) == []
  end

  test "planta e nome inválidos dão erro por campo sem e-mail" do
    assert {:error, errors} =
             Genesis.submit(params("ana@exemplo.com", %{"name" => "x", "blueprint" => %{}}), @ip)

    assert %{"blueprint" => [_ | _], "name" => [_ | _]} = errors
    refute Map.has_key?(errors, "email")
    refute inspect(errors) =~ "ana@exemplo.com"
    assert_no_email_sent()
  end

  test "e-mail inválido dá mensagem genérica sem ecoar o endereço" do
    assert {:error, %{"email" => ["e-mail inválido"]} = errors} =
             Genesis.submit(params("naoemail secreto"), @ip)

    refute inspect(errors) =~ "secreto"
  end

  test "limite por e-mail" do
    for i <- 1..3 do
      assert {:ok, :sent} = Genesis.submit(params("a@b.com"), {1, 1, 1, i})
    end

    assert {:error, :rate_limited} = Genesis.submit(params("A@B.com"), {1, 1, 1, 4})
  end

  test "limite por rede" do
    for i <- 1..10 do
      assert {:ok, :sent} = Genesis.submit(params("u#{i}@b.com"), @ip)
    end

    assert {:error, :rate_limited} = Genesis.submit(params("u11@b.com"), @ip)
  end

  test "apaga tokens vencidos a cada envio" do
    Repo.insert!(%VerificationToken{
      token_hash: :crypto.hash(:sha256, "velho"),
      email_normalized: "velho@b.com",
      name: "V",
      blueprint: %{},
      expires_at: DateTime.add(DateTime.utc_now(), -60, :second)
    })

    assert {:ok, :sent} = Genesis.submit(params("novo@b.com"), @ip)
    assert [%{email_normalized: "novo@b.com"}] = Repo.all(VerificationToken)
  end

  test "inspect de creator, token e changesets não mostra o endereço" do
    addr = "segredo@exemplo.com"
    {:ok, _} = Genesis.submit(params(addr), @ip)
    token = Repo.one!(VerificationToken)
    creator = %Creator{email_normalized: addr}

    for term <- [
          token,
          creator,
          VerificationToken.changeset(%VerificationToken{}, %{email_normalized: addr}),
          Creator.changeset(%Creator{}, %{email_normalized: addr})
        ] do
      refute inspect(term) =~ addr
    end
  end
end
