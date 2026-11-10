defmodule Abyss.DataCase do
  @moduledoc """
  Caso de teste para módulos que tocam o banco. Cada teste roda numa
  transação do sandbox, desfeita ao final.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      alias Abyss.Repo

      import Ecto
      import Ecto.Changeset
      import Ecto.Query
      import Abyss.DataCase
    end
  end

  setup tags do
    Abyss.DataCase.setup_sandbox(tags)
    :ok
  end

  def setup_sandbox(tags) do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(Abyss.Repo, shared: not tags[:async])
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
  end
end
