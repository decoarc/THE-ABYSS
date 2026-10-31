defmodule Abyss.World.Sim do
  @moduledoc """
  Núcleo puro e determinístico do movimento. Sem processos, sem RNG global,
  sem leitura de Application env: tudo entra por `new/1` e `step/2`.
  """

  alias Abyss.World.{Organism, Species}

  @edge_margin 3.0
  @y_margin 0.5
  @sep_gap 0.5
  @spawn_tries 50
  @exclusion_reach 2.0

  defstruct organisms: [], rng: nil, tick: 0, bounds: %{}

  @type t :: %__MODULE__{
          organisms: [Organism.t()],
          rng: :rand.state(),
          tick: non_neg_integer,
          bounds: map
        }

  @doc """
  `opts` pode trazer `exclusion: %{center: {x, y, z}, radius: r}` (esfera onde
  nenhum organismo pode estar; ausente ou nil = sem zona livre).
  """
  @spec new(map) :: t
  def new(
        %{
          population: pop,
          seed: seed,
          radius: radius,
          y_min: y_min,
          y_max: y_max,
          now_ms: now_ms
        } = opts
      )
      when is_integer(pop) and pop >= 5 and pop <= 200 do
    bounds = %{
      radius: radius,
      y_min: y_min,
      y_max: y_max,
      exclusion: Map.get(opts, :exclusion)
    }

    species = Species.all()
    n = length(species)
    base = div(pop, n)
    extra = rem(pop, n)

    roster =
      species
      |> Enum.with_index()
      |> Enum.flat_map(fn {sp, i} ->
        for k <- 1..(base + if(i < extra, do: 1, else: 0)), do: {sp, k}
      end)

    rng = :rand.seed_s(:exsss, seed)

    {organisms, rng} =
      Enum.reduce(roster, {[], rng}, fn {sp, k}, {acc, rng} ->
        {o, rng} = spawn_one(sp, k, now_ms, bounds, acc, rng)
        {[o | acc], rng}
      end)

    %__MODULE__{organisms: Enum.reverse(organisms), rng: rng, tick: 0, bounds: bounds}
  end

  def new(%{population: pop}) do
    raise ArgumentError, "população deve estar entre 5 e 200, recebido: #{inspect(pop)}"
  end

  @spec step(t, float) :: t
  def step(%__MODULE__{organisms: orgs, rng: rng, bounds: bounds} = sim, dt) do
    snapshot = Enum.map(orgs, &{&1.id, &1.pos, Species.get!(&1.species).body_radius})

    {new_orgs, rng} =
      Enum.map_reduce(orgs, rng, fn o, rng -> step_one(o, snapshot, bounds, dt, rng) end)

    %{sim | organisms: new_orgs, rng: rng, tick: sim.tick + 1}
  end

  # --- spawn -----------------------------------------------------------------

  defp spawn_one(sp, k, now_ms, bounds, placed, rng) do
    {pos, rng} = pick_position(sp, bounds, placed, rng, @spawn_tries)
    {yaw, rng} = uniform_range(rng, -:math.pi(), :math.pi())
    {mode_left, rng} = initial_mode_left(sp, rng)

    o = %Organism{
      id: "#{sp.code}-#{k |> Integer.to_string() |> String.pad_leading(4, "0")}",
      species: sp.id,
      born_ms: now_ms,
      pos: pos,
      yaw: yaw,
      mode: :run,
      mode_left: mode_left
    }

    {o, rng}
  end

  defp pick_position(sp, bounds, placed, rng, tries) do
    {pos, rng} = random_position(bounds, rng)

    free? =
      Enum.all?(placed, fn p ->
        dist(pos, p.pos) >= sp.body_radius + Species.get!(p.species).body_radius + @sep_gap
      end)

    free? = free? and not in_exclusion?(pos, sp, bounds)

    if free? or tries <= 1,
      do: {keep_out(pos, sp, bounds), rng},
      else: pick_position(sp, bounds, placed, rng, tries - 1)
  end

  defp random_position(%{radius: r, y_min: y0, y_max: y1}, rng) do
    {u, rng} = :rand.uniform_s(rng)
    {a, rng} = uniform_range(rng, 0.0, 2 * :math.pi())
    {y, rng} = uniform_range(rng, y0 + @y_margin, y1 - @y_margin)
    rho = (r - @edge_margin) * :math.sqrt(u)
    {{rho * :math.cos(a), y, rho * :math.sin(a)}, rng}
  end

  defp initial_mode_left(%{run_s: {lo, hi}}, rng), do: uniform_range(rng, lo * 1.0, hi * 1.0)
  defp initial_mode_left(_, rng), do: {0.0, rng}

  # --- step ------------------------------------------------------------------

  defp step_one(o, snapshot, bounds, dt, rng) do
    sp = Species.get!(o.species)
    sdt = :math.sqrt(dt)

    {n1, rng} = :rand.normal_s(rng)
    {n2, rng} = :rand.normal_s(rng)
    yaw = o.yaw + n1 * sp.wander * sdt
    pitch = clamp(o.pitch * 0.98 + n2 * 0.3 * sp.wander * sdt, -0.35, 0.35)

    {mode, mode_left, yaw, rng} = advance_mode(sp, o.mode, o.mode_left - dt, yaw, rng)

    target = if mode == :pause, do: 0.0, else: sp.max_speed
    dir = {:math.cos(pitch) * :math.cos(yaw), :math.sin(pitch), :math.cos(pitch) * :math.sin(yaw)}

    desired =
      dir
      |> scale(target)
      |> add(edge_steer(o.pos, bounds, sp.max_speed))
      |> add(exclusion_steer(o.pos, sp, bounds))
      |> add(separation(o, sp, snapshot))

    k = min(1.0, sp.turn_rate * dt)
    vel = o.vel |> add(scale(sub(desired, o.vel), k)) |> clamp_norm(sp.max_speed)
    pos = o.pos |> add(scale(vel, dt)) |> clamp_volume(bounds) |> keep_out(sp, bounds)

    {%{o | pos: pos, vel: vel, yaw: yaw, pitch: pitch, mode: mode, mode_left: mode_left}, rng}
  end

  # Só a Célula alterna entre correr e pausar (run_s/pause_s definidos).
  defp advance_mode(%{run_s: nil}, mode, _left, yaw, rng), do: {mode, 0.0, yaw, rng}

  defp advance_mode(%{pause_s: pause}, :run, left, yaw, rng) when left <= 0 do
    {:pause, pause * 1.0, yaw + :math.pi(), rng}
  end

  defp advance_mode(%{run_s: {lo, hi}}, :pause, left, yaw, rng) when left <= 0 do
    {t, rng} = uniform_range(rng, lo * 1.0, hi * 1.0)
    {:run, t, yaw, rng}
  end

  defp advance_mode(_sp, mode, left, yaw, rng), do: {mode, left, yaw, rng}

  defp edge_steer({x, y, z}, %{radius: r, y_min: y0, y_max: y1}, gain) do
    rh = :math.sqrt(x * x + z * z)
    edge = r - @edge_margin

    {sx, sz} =
      if rh > edge and rh > 1.0e-9 do
        f = -(rh - edge) * gain / rh
        {x * f, z * f}
      else
        {0.0, 0.0}
      end

    lo = y0 + @y_margin
    hi = y1 - @y_margin

    sy =
      cond do
        y < lo -> (lo - y) * gain
        y > hi -> -(y - hi) * gain
        true -> 0.0
      end

    {sx, sy, sz}
  end

  # Zona livre (esfera, inflada pelo raio do corpo): empurra para fora ao se
  # aproximar, no mesmo estilo do edge_steer.
  defp exclusion_steer(_pos, _sp, %{exclusion: nil}), do: {0.0, 0.0, 0.0}

  defp exclusion_steer(pos, sp, %{exclusion: %{center: c, radius: r}}) do
    limit = r + sp.body_radius + @exclusion_reach
    d = dist(pos, c)

    if d < limit do
      u = outward(pos, c, d)
      scale(u, (limit - d) * sp.max_speed)
    else
      {0.0, 0.0, 0.0}
    end
  end

  defp in_exclusion?(_pos, _sp, %{exclusion: nil}), do: false

  defp in_exclusion?(pos, sp, %{exclusion: %{center: c, radius: r}}),
    do: dist(pos, c) < r + sp.body_radius

  # Projeção dura: leva à superfície da esfera e reaplica o volume; se o clamp
  # de y devolveu o ponto para dentro, desloca na horizontal até sair.
  defp keep_out(pos, _sp, %{exclusion: nil}), do: pos

  defp keep_out(pos, sp, %{exclusion: %{center: {cx, cy, cz} = c, radius: r}} = bounds) do
    reff = r + sp.body_radius
    d = dist(pos, c)

    if d >= reff do
      pos
    else
      p = c |> add(scale(outward(pos, c, d), reff)) |> clamp_volume(bounds)

      if dist(p, c) >= reff - 1.0e-9 do
        p
      else
        {_, y, _} = p
        dy = y - cy
        h = :math.sqrt(max(reff * reff - dy * dy, 0.0)) + 1.0e-6
        {px, _, pz} = pos
        hx = px - cx
        hz = pz - cz
        hn = :math.sqrt(hx * hx + hz * hz)
        {ux, uz} = if hn > 1.0e-9, do: {hx / hn, hz / hn}, else: {0.0, -1.0}
        clamp_volume({cx + ux * h, y, cz + uz * h}, bounds)
      end
    end
  end

  defp outward(pos, c, d) do
    {dx, dy, dz} = sub(pos, c)
    if d > 1.0e-9, do: {dx / d, dy / d, dz / d}, else: {0.0, 0.0, -1.0}
  end

  defp separation(o, sp, snapshot) do
    Enum.reduce(snapshot, {0.0, 0.0, 0.0}, fn {id, pos, r}, acc ->
      if id == o.id do
        acc
      else
        d = dist(o.pos, pos)
        reach = sp.body_radius + r + @sep_gap

        if d < reach do
          {dx, dy, dz} = sub(o.pos, pos)
          u = if d > 1.0e-9, do: {dx / d, dy / d, dz / d}, else: {1.0, 0.0, 0.0}
          add(acc, scale(u, (reach - d) / reach * sp.max_speed * 2.0))
        else
          acc
        end
      end
    end)
  end

  defp clamp_volume({x, y, z}, %{radius: r, y_min: y0, y_max: y1}) do
    rh = :math.sqrt(x * x + z * z)
    {x, z} = if rh > r, do: {x * r / rh, z * r / rh}, else: {x, z}
    {x, clamp(y, y0, y1), z}
  end

  # --- helpers ---------------------------------------------------------------

  defp uniform_range(rng, lo, hi) do
    {u, rng} = :rand.uniform_s(rng)
    {lo + u * (hi - lo), rng}
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)

  defp clamp_norm(v, max) do
    n = norm(v)
    if n > max, do: scale(v, max / n), else: v
  end

  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist(a, b), do: norm(sub(a, b))
  defp add({a, b, c}, {d, e, f}), do: {a + d, b + e, c + f}
  defp sub({a, b, c}, {d, e, f}), do: {a - d, b - e, c - f}
  defp scale({a, b, c}, k), do: {a * k, b * k, c * k}
end
