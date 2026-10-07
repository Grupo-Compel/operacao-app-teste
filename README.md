# Operação · app de teste de campo

App de teste do módulo OPERAÇÃO da Plataforma Compel (a "primeira aula prática" do plano de etapas, etapa 0).
Ele mede, num celular de verdade: abrir sem sinal, guardar registro e foto sem sinal, o GPS (em UTM),
a bússola, e o envio quando o sinal volta — com o app aberto e, no Android, com o app fechado.

- **Nada aqui é dado real.** O app só grava na aba `APP_TESTE` da planilha "Operação - Base", com um
  código de teste gerado pelo menu da planilha. O código não fica neste repositório: é colado no celular.
- O servidor é o `06_AppTeste.gs` do projeto Apps Script "Operação" (não está aqui).
- Detalhes e decisões: `CONCEITO_MODULO_OPERACAO.md`, seção 29, na base de conhecimento do projeto.

Versão nova do app = trocar `VERSAO_CACHE` no `sw.js`; o celular pega na próxima abertura com sinal.
