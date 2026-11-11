defmodule Abyss.Genesis.RateLimitTest do
  use ExUnit.Case, async: false

  alias Abyss.Genesis.RateLimit

  setup do
    RateLimit.reset()
    :ok
  end

  test "janela vence e libera" do
    t0 = 1_000
    assert RateLimit.hit(:k, {2, 1}, t0) == :ok
    assert RateLimit.hit(:k, {2, 1}, t0) == :ok
    assert RateLimit.hit(:k, {2, 1}, t0) == :limited
    assert RateLimit.hit(:outra, {2, 1}, t0) == :ok
    assert RateLimit.hit(:k, {2, 1}, t0 + 1) == :ok
  end
end
