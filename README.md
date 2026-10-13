# Operação · app de teste de campo

App de teste do módulo OPERAÇÃO da Plataforma Compel (a "primeira aula prática" do plano de etapas, etapa 0).
Ele mede, num celular de verdade: abrir sem sinal, guardar registro e foto sem sinal, o GPS (em UTM),
a bússola, e o envio quando o sinal volta — com o app aberto e, no Android, com o app fechado.

- **Nada aqui é dado real.** O app só grava na aba `APP_TESTE` da planilha "Operação - Base", com um
  código de teste gerado pelo menu da planilha. O código não fica neste repositório: é colado no celular.
- O servidor é o `06_AppTeste.gs` do projeto Apps Script "Operação" (não está aqui).
- Detalhes e decisões: `CONCEITO_MODULO_OPERACAO.md`, seção 29, na base de conhecimento do projeto.

Versão nova do app = trocar `VERSAO_CACHE` no `sw.js`; o celular pega na próxima abertura com sinal.

## `campo/` · o app do encarregado (etapa 5a, 13/10/2026)

O app de verdade do encarregado, em `https://grupo-compel.github.io/operacao-app-teste/campo/`: as telas
Hoje, Diário, Encerrar e Envio. Sem login: o celular é ligado **uma vez** pelo link que o supervisor gera na tela
"Aparelhos do campo" do sistema, e o dia é assinado com a foto do rosto. Preenche o PS sem sinal e envia quando
o sinal volta.

- **Aqui só está o app.** O endereço do servidor chega no link, e os dados (folhas, equipe, códigos) e as regras
  do lançamento chegam no pacote do dia, baixado no Wi-Fi da base. Nada disso fica neste repositório.
- O servidor é o `27_AppCampo.gs` do projeto Apps Script "Operação" (não está aqui).
- Versão nova = trocar `VERSAO_CACHE` em `campo/sw.js`. Cada app apaga só os próprios caches (`operacao-campo-…`
  e `operacao-teste-…`), porque os dois moram no mesmo site.
