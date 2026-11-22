# Imagem de produção da API (release do Mix), para a VPS (gate O).
# Build pelo infra/compose/compose.prod.yaml: o contexto é apps/api e o contexto extra
# `shared` traz o mapa e o catálogo (montados em /shared, como no ambiente de dev).
ARG ELIXIR_IMAGE=elixir:1.20.5-otp-29
# A imagem do Elixir é Debian 13 (trixie); o runtime usa a mesma base para as libs baterem.
ARG RUNNER_IMAGE=debian:trixie-slim

FROM ${ELIXIR_IMAGE} AS build

ENV MIX_ENV=prod
RUN mix local.hex --force && mix local.rebar --force
WORKDIR /app

COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
COPY config/config.exs config/prod.exs config/
RUN mix deps.compile

COPY lib lib
COPY priv priv
RUN mix compile
COPY config/runtime.exs config/
RUN mix release

FROM ${RUNNER_IMAGE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 libsctp1 locales ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8 \
    MIX_ENV=prod PHX_SERVER=true PORT=4000

WORKDIR /app
RUN useradd --system --home /app abyss && chown abyss /app

COPY --from=shared world /shared/world
COPY --from=shared genesis /shared/genesis
COPY --from=build --chown=abyss /app/_build/prod/rel/abyss ./

USER abyss
EXPOSE 4000

# Migra e sobe. `exec` entrega o SIGTERM do `docker compose stop` à VM, que grava a
# fotografia do mundo ao desligar (gate P).
CMD ["sh", "-c", "bin/abyss eval 'Abyss.Release.migrate()' && exec bin/abyss start"]
