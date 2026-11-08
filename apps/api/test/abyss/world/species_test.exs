defmodule Abyss.World.SpeciesTest do
  use ExUnit.Case, async: true

  alias Abyss.World.Species

  @fields ~w(id code name max_speed wander turn_rate body_radius run_s pause_s diet perception
             sated_s school shelter burst energy_max metabolism mature_s adult_life_s)a

  test "toda espécie tem as características do E2" do
    ids = Enum.map(Species.all(), & &1.id)

    for sp <- Species.all() do
      for f <- @fields, do: assert(Map.has_key?(sp, f), "#{sp.id} sem #{f}")
      assert is_number(sp.perception)
      assert is_boolean(sp.school) and is_boolean(sp.shelter)
      assert sp.diet in [:flora, :particles] or match?({:prey, [_ | _]}, sp.diet)

      with {:prey, prey} <- sp.diet, do: assert(Enum.all?(prey, &(&1 in ids)))
    end
  end
end
