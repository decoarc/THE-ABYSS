defmodule Abyss.World.Life do
  @moduledoc """
  Regras puras de vida: gasto de energia, ganho, fases (jovem/adulto), causa de
  morte e raio efetivo. Tudo sai das características da espécie (`sp`) e do
  mapa `ecology` (`eco`); nenhuma regra testa o id da espécie.
  """

  alias Abyss.World.Organism

  @doc "Energia nova depois de `dt` s: `metabolism × (1 + swim_cost × (|v|/max_speed)²)`."
  @spec drain(Organism.t(), map, map, float) :: float
  def drain(%Organism{vel: {vx, vy, vz}, energy: energy}, sp, eco, dt) do
    ratio = :math.sqrt(vx * vx + vy * vy + vz * vz) / sp.max_speed
    max(energy - sp.metabolism * (1 + eco.swim_cost * ratio * ratio) * dt, 0.0)
  end

  @doc "Soma `amount` à energia, limitada a `energy_max`."
  @spec gain(Organism.t(), map, number) :: Organism.t()
  def gain(%Organism{energy: energy} = o, sp, amount),
    do: %{o | energy: min(energy + amount, sp.energy_max)}

  @doc "Jovem com `mature_s` cumpridos vira adulto (e `stage_ms` passa a ser `now_ms`)."
  @spec advance_stage(Organism.t(), map, integer) :: Organism.t()
  def advance_stage(%Organism{stage: :juvenile, stage_ms: since} = o, sp, now_ms) do
    if now_ms - since >= sp.mature_s * 1000, do: %{o | stage: :adult, stage_ms: now_ms}, else: o
  end

  def advance_stage(o, _sp, _now_ms), do: o

  @doc "Fome tem prioridade sobre velhice; jovem não morre de velhice."
  @spec death_cause(Organism.t(), map, integer) :: nil | :starvation | :old_age
  def death_cause(%Organism{energy: energy, stage: stage, stage_ms: since}, sp, now_ms) do
    cond do
      energy <= 0 -> :starvation
      stage == :adult and now_ms - since >= sp.adult_life_s * 1000 -> :old_age
      true -> nil
    end
  end

  @doc "Raio efetivo: `body_radius × scale`, vezes `juvenile_scale` se jovem."
  @spec radius(Organism.t(), map, number, map) :: float
  def radius(%Organism{stage: stage}, sp, scale, eco) do
    r = sp.body_radius * scale
    if stage == :juvenile, do: r * eco.juvenile_scale, else: r
  end
end
