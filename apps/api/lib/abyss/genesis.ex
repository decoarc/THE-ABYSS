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
    VerificationToken
  }

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
    Repo.delete_all(from(t in VerificationToken, where: t.expires_at < ^now))

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
        })
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
      )
    )
  end

  defp limit(name), do: Keyword.fetch!(config(:limits), name)

  defp config(key), do: Application.fetch_env!(:abyss, :genesis) |> Keyword.fetch!(key)
end
