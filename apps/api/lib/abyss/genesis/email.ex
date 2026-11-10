defmodule Abyss.Genesis.Email do
  @moduledoc "E-mails da gênese de espécies (pt-BR). Nunca registrar endereço ou link em log."

  import Swoosh.Email

  @from {"The Abyss", "nao-responda@the-abyss.local"}
  @subject "Confirme a sua espécie no The Abyss"

  def verify(to, url) do
    new()
    |> to(to)
    |> from(@from)
    |> subject(@subject)
    |> text_body("""
    Olá!

    Para criar a sua espécie no The Abyss, abra o link abaixo:

    #{url}

    O link vale por 30 minutos e só pode ser usado uma vez.
    Cada e-mail cria uma única espécie, para sempre.

    Se você não pediu isto, ignore esta mensagem.
    """)
    |> html_body("""
    <p>Olá!</p>
    <p>Para criar a sua espécie no The Abyss, abra o link abaixo:</p>
    <p><a href="#{url}">Confirmar a minha espécie</a></p>
    <p>O link vale por 30 minutos e só pode ser usado uma vez.
    Cada e-mail cria uma única espécie, para sempre.</p>
    <p>Se você não pediu isto, ignore esta mensagem.</p>
    """)
  end

  def already_used(to) do
    new()
    |> to(to)
    |> from(@from)
    |> subject(@subject)
    |> text_body("""
    Olá!

    Este e-mail já criou uma espécie no The Abyss, e cada e-mail cria uma única
    espécie, para sempre. Por isso não há link para confirmar.

    Se não foi você quem pediu, ignore esta mensagem.
    """)
    |> html_body("""
    <p>Olá!</p>
    <p>Este e-mail já criou uma espécie no The Abyss, e cada e-mail cria uma única
    espécie, para sempre. Por isso não há link para confirmar.</p>
    <p>Se não foi você quem pediu, ignore esta mensagem.</p>
    """)
  end
end
