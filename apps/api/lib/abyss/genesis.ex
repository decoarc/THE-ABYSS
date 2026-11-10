defmodule Abyss.Genesis do
  @moduledoc """
  Contexto da gênese de espécies: pedido de criação (envio do link de
  verificação). O e-mail e o token nunca vão para logs nem para respostas.
  """

  import Ecto.Query

  alias Abyss.{Mailer, Repo}

  alias Abyss.Genesis.{
    Blueprint,
    Catalog,
    Creator,
    Email,
    RateLimit,
    SpeciesRecord,
    Traits,
    VerificationToken
  }

  alias Abyss.World.Server

  require Logger

  @email_re ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/

  @spec normalize_email(term) :: {:ok, String.t()} | :error
  def normalize_email(email) when is_binary(email) do
    norm = email |> String.trim() |> String.downcase()

    if String.valid?(norm) and String.length(norm) <= 254 and Regex.match?(@email_re, norm),
      do: {:ok, norm},
      else: :error
  end

  def normalize_email(_), do: :error

  @spec validate_name(term) :: {:ok, String.t()} | {:error, String.t()}
  def validate_name(name) when is_binary(name) do
    trimmed = String.trim(name)
    len = if String.valid?(trimmed), do: String.length(trimmed), else: 0

    cond do
      len < 2 or len > 32 -> {:error, "nome deve ter de 2 a 32 caracteres"}
      String.match?(trimmed, ~r/[\p{Cc}\p{Cf}]/u) -> {:error, "nome com caracteres inválidos"}
      true -> {:ok, trimmed}
    end
  end

  def validate_name(_), do: {:error, "nome inválido"}

  @spec submit(map, tuple) :: {:ok, :sent} | {:error, :rate_limited} | {:error, map}
  def submit(params, ip) when is_map(params) do
    email = normalize_email(params["email"])

    if rate_limited?(ip, email) do
      {:error, :rate_limited}
    else
      case validate(params, email) do
        {:ok, norm_email, name, blueprint} -> deliver(norm_email, name, blueprint)
        {:error, errors} -> {:error, errors}
      end
    end
  end

  def submit(_, ip), do: submit(%{}, ip)

  @doc """
  Confirma um token (uso único), publica a espécie no banco e a faz nascer no
  mundo. `opts`: `:ip` (limite de confirmações) e `:world` (servidor).
  """
  @spec confirm(term, keyword) ::
          {:ok, %{id: String.t(), name: String.t(), code: String.t()}}
          | {:error, :invalid | :taken | :rate_limited}
  def confirm(token, opts \\ []) do
    ip = Keyword.get(opts, :ip, {127, 0, 0, 1})
    world = Keyword.get(opts, :world, Server)

    cond do
      RateLimit.hit({:confirm_ip, ip}, limit(:confirm_ip)) == :limited ->
        {:error, :rate_limited}

      not is_binary(token) ->
        {:error, :invalid}

      true ->
        case publish(token) do
          {:ok, record, email} ->
            Repo.delete_all(from(t in VerificationToken, where: t.email_normalized == ^email),
              log: false
            )

            spawn_in_world(world, record)
            {:ok, %{id: "sp#{record.id}", name: record.name, code: record.code}}

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  @spec species_from_record(SpeciesRecord.t()) :: Abyss.World.Species.t()
  def species_from_record(%SpeciesRecord{} = record) do
    Traits.species(record.blueprint, Catalog.get(), %{
      id: "sp#{record.id}",
      code: record.code,
      name: record.name
    })
  end

  @doc "Código público da espécie: \"S\" + id em base 36 (mín. 2 dígitos, maiúsculo)."
  @spec code_for(pos_integer) :: String.t()
  def code_for(id), do: "S" <> String.pad_leading(Integer.to_string(id, 36), 2, "0")

  @doc """
  Espécies para o boot do mundo: as vivas (por id) e as 100 extintas mais
  recentes (com o ms da extinção). Sem banco, devolve vazio e registra o erro.
  """
  @spec boot_species() :: %{
          live: [Abyss.World.Species.t()],
          extinct: [{Abyss.World.Species.t(), integer}]
        }
  def boot_species do
    live =
      from(s in SpeciesRecord, where: is_nil(s.extinct_at), order_by: [asc: s.id])
      |> Repo.all(log: false)
      |> Enum.map(&species_from_record/1)

    extinct =
      from(s in SpeciesRecord,
        where: not is_nil(s.extinct_at),
        order_by: [desc: s.extinct_at, desc: s.id],
        limit: 100
      )
      |> Repo.all(log: false)
      |> Enum.map(&{species_from_record(&1), DateTime.to_unix(&1.extinct_at, :millisecond)})

    %{live: live, extinct: extinct}
  rescue
    e ->
      Logger.error("boot_species falhou (#{inspect(e.__struct__)}); mundo sem espécies criadas")
      %{live: [], extinct: []}
  end

  @doc "Apaga criadores, espécies e tokens (reinicia os ids)."
  @spec reset!() :: :ok
  def reset! do
    Ecto.Adapters.SQL.query!(
      Repo,
      "TRUNCATE species, creators, verification_tokens RESTART IDENTITY",
      [],
      log: false
    )

    :ok
  end

  @doc "Só para medição: publica `count` espécies sorteadas (criadores `seed-<i>@seed.invalid`)."
  @spec seed!(pos_integer, integer) :: :ok
  def seed!(count, seed) do
    cat = Catalog.get()
    now = DateTime.utc_now()

    Enum.reduce(1..count//1, :rand.seed_s(:exsss, {seed, 7, 7}), fn i, rng ->
      {bp, rng} = Abyss.Genesis.Random.blueprint(rng, cat)

      creator =
        Repo.insert!(%Creator{email_normalized: "seed-#{i}@seed.invalid"}, log: false)

      {:ok, _} =
        insert_species(creator, %{name: "Semente #{i}", blueprint: bp}, now)

      rng
    end)

    :ok
  end

  defp publish(token) do
    hash = :crypto.hash(:sha256, token)
    now = DateTime.utc_now()

    result =
      Repo.transaction(
        fn ->
          # DELETE ... RETURNING é o uso único: só uma transação leva a linha.
          {_, rows} =
            Repo.delete_all(
              from(t in VerificationToken,
                where: t.token_hash == ^hash and t.expires_at > ^now,
                select: t
              ),
              log: false
            )

          row = List.first(rows) || Repo.rollback(:invalid)
          creator = find_or_create_creator(row.email_normalized)

          case insert_species(creator, row, now) do
            {:ok, record} -> {record, row.email_normalized}
            {:error, _changeset} -> Repo.rollback(:taken)
          end
        end,
        log: false
      )

    case result do
      {:ok, {record, email}} -> {:ok, record, email}
      {:error, reason} -> {:error, reason}
    end
  end

  defp find_or_create_creator(email) do
    Repo.insert!(%Creator{email_normalized: email},
      on_conflict: :nothing,
      conflict_target: :email_normalized,
      log: false
    )

    Repo.get_by!(Creator, [email_normalized: email], log: false)
  end

  # O código depende do id do banco: insere com um código provisório único e
  # o corrige na mesma transação.
  defp insert_species(creator, row, now) do
    placeholder = "tmp-" <> Base.encode16(:crypto.strong_rand_bytes(8))

    attrs = %{
      creator_id: creator.id,
      name: row.name,
      code: placeholder,
      blueprint: row.blueprint,
      ruleset: "s1",
      published_at: now
    }

    with {:ok, record} <-
           Repo.insert(SpeciesRecord.changeset(%SpeciesRecord{}, attrs), log: false) do
      code = code_for(record.id)
      {:ok, record |> Ecto.Changeset.change(code: code) |> Repo.update!(log: false)}
    end
  end

  # A publicação já está no banco; mundo ausente ou morto não falha a confirmação
  # (o próximo boot carrega a espécie).
  defp spawn_in_world(world, record) do
    if GenServer.whereis(world), do: Server.add_species(world, species_from_record(record))
    :ok
  catch
    :exit, _ -> :ok
    :error, _ -> :ok
  end

  defp rate_limited?(ip, email) do
    ip_hit = RateLimit.hit({:submit_ip, ip}, limit(:submit_ip))

    email_hit =
      case email do
        {:ok, norm} -> RateLimit.hit({:submit_email, norm}, limit(:submit_email))
        :error -> :ok
      end

    ip_hit == :limited or email_hit == :limited
  end

  defp validate(params, email) do
    {email_errors, norm_email} =
      case email do
        {:ok, norm} -> {[], norm}
        :error -> {["e-mail inválido"], nil}
      end

    {name_errors, name} =
      case validate_name(params["name"]) do
        {:ok, n} -> {[], n}
        {:error, msg} -> {[msg], nil}
      end

    {bp_errors, blueprint} =
      case Blueprint.validate(params["blueprint"], Catalog.get()) do
        {:ok, bp} -> {[], bp}
        {:error, msgs} -> {msgs, nil}
      end

    errors =
      [{"email", email_errors}, {"name", name_errors}, {"blueprint", bp_errors}]
      |> Enum.reject(fn {_, msgs} -> msgs == [] end)
      |> Map.new()

    if errors == %{}, do: {:ok, norm_email, name, blueprint}, else: {:error, errors}
  end

  # O destinatário é o e-mail normalizado (trim + downcase).
  defp deliver(to, name, blueprint) do
    now = DateTime.utc_now()
    Repo.delete_all(from(t in VerificationToken, where: t.expires_at < ^now), log: false)

    if has_species?(to) do
      {:ok, _} = Mailer.deliver(Email.already_used(to))
    else
      token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)

      Repo.insert!(
        VerificationToken.changeset(%VerificationToken{}, %{
          token_hash: :crypto.hash(:sha256, token),
          email_normalized: to,
          name: name,
          blueprint: blueprint,
          expires_at: DateTime.add(now, config(:token_ttl_s), :second)
        }),
        log: false
      )

      {:ok, _} = Mailer.deliver(Email.verify(to, "#{config(:web_url)}/#confirmar=#{token}"))
    end

    {:ok, :sent}
  end

  defp has_species?(norm_email) do
    Repo.exists?(
      from(s in SpeciesRecord,
        join: c in Creator,
        on: c.id == s.creator_id,
        where: c.email_normalized == ^norm_email
      ),
      log: false
    )
  end

  defp limit(name), do: Keyword.fetch!(config(:limits), name)

  defp config(key), do: Application.fetch_env!(:abyss, :genesis) |> Keyword.fetch!(key)
end
