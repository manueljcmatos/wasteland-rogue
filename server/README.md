# Servidor do Wasteland Rogue (Telegram + Stars)

Este servidor faz o seguinte:

- **Login:** valida a sessão do Telegram de cada jogador (assinatura `initData`).
- **Vendas:** vende diamantes com **Telegram Stars ⭐**. É a forma obrigatória do Telegram para vender bens digitais em Mini Apps.
- **Diamantes e baús:** guarda os diamantes e os baús de vault de cada jogador (editar o save no telemóvel não dá diamantes).
- **Save na nuvem:** guarda um save por conta do Telegram.
- **☢️ Shards:** pontos que vão ser convertidos no token TON (Fase 3). O servidor decide quanto vale cada evento e limita os ganhos por dia (`SHARDS_DAILY_CAP`, 120 por defeito).
- **Carteira TON:** guarda o endereço que o jogador liga com o TON Connect (um endereço por conta).
- **Classificação:** os 30 jogadores com mais Shards.
- **Comandos do bot:** responde a `/start`, `/paysupport` e `/refund` (este último só para o admin).

Não precisa de dependências: Node.js 22.13 ou mais recente, com SQLite incluído.

## 1. Criar o bot

1. No Telegram, abre o **@BotFather** e envia `/newbot`. Escolhe um nome e um username (ex.: `WastelandRogueBot`).
2. Guarda o **token** que o BotFather te dá. É secreto: nunca o publiques no GitHub.
3. Descobre o teu ID numérico (por exemplo com o **@userinfobot**). Vai para `ADMIN_IDS`.

## 2. Pôr o servidor online

Precisas de um alojamento com HTTPS e **disco persistente** (é lá que fica o ficheiro da base de dados). Exemplos: Railway, Fly.io, Render (com disco) ou uma VPS.
Este diretório tem um `Dockerfile`, por isso basta apontar o serviço para a pasta `server/`.

Configura estas variáveis de ambiente (ver `.env.example`):

| Variável | Valor |
|---|---|
| `BOT_TOKEN` | token do BotFather |
| `WEBHOOK_SECRET` | uma frase aleatória longa (ex.: `openssl rand -hex 32`) |
| `PUBLIC_URL` | o endereço HTTPS do servidor, ex.: `https://wasteland-rogue.up.railway.app` |
| `GAME_URL` | `https://manueljcmatos.github.io/wasteland-rogue/` |
| `ALLOWED_ORIGINS` | `https://manueljcmatos.github.io` |
| `ADMIN_IDS` | o teu ID numérico do Telegram |
| `SUPPORT_CONTACT` | como os jogadores te contactam sobre pagamentos |
| `DB_PATH` | caminho no disco persistente, ex.: `/data/game.db` |

Ao arrancar com `PUBLIC_URL` definido, o servidor faz duas coisas sozinho: regista o webhook no Telegram e põe o botão **Play** no menu do bot.
Confirma que está online abrindo `https://O-TEU-SERVIDOR/health`, que deve responder `{"ok":true}`.

## 3. Ligar o jogo ao servidor

No repositório do jogo, edita o `config.js`:

```js
window.GAME_CONFIG = {
  serverUrl: 'https://O-TEU-SERVIDOR',
  botUsername: 'WastelandRogueBot',
  devFreeGems: false,
};
```

Faz commit. O GitHub Pages atualiza o jogo em cerca de 1 minuto.

## 4. Testar

1. Abre o bot no Telegram, envia `/start` e carrega em **Play**.
2. Fala com a **Mystic Zara** na base. Os pacotes de diamantes mostram o preço em ⭐.
3. Faz uma compra pequena (75 ⭐). O Telegram confirma, o servidor credita os diamantes e o bot envia uma mensagem de agradecimento.
4. Para reembolsar uma compra, envia ao bot `/refund <telegram_payment_charge_id>`. O ID aparece nos registos do servidor e na tabela `payments`.

## 5. Receber o dinheiro

As Stars ganhas acumulam no saldo do bot e podem ser **levantadas em TON** através da plataforma **Fragment** (fragment.com).
O Telegram aplica um período de espera e valores mínimos para levantamentos. Confirma as regras atuais na documentação oficial do Telegram para Stars antes de lançar.

## ☢️ Shards e token (roteiro)

| Fase | O quê | Estado |
|---|---|---|
| 1 | Shards ganhos a jogar, carteira TON ligada, classificação | ✅ pronto |
| 2 | Criar o token (Jetton) na rede TON: primeiro testnet, depois mainnet | por fazer: decidir nome, símbolo e quantidade |
| 3 | Converter Shards no token e enviá-lo para a carteira de cada jogador | por fazer: precisa de revisão legal e anti-batota |

Quanto vale cada evento (definido no servidor, em `SHARD_EVENTS`):

| Evento | Shards |
|---|---|
| Derrotar um Overlord | 25 |
| Completar uma missão | 5 |
| Limpar um posto | 3 |
| Nova melhor zona (até 3 zonas por vez) | 4 por zona |

A tabela `shard_log` regista cada ganho, para analisares padrões de batota antes da Fase 3.

O ficheiro `tonconnect-manifest.json` na raiz do jogo identifica o jogo junto das carteiras (nome e ícone).

## Preços

Os pacotes estão em `PACKS` no `server.js` e em `GEM_PACKS` no `js/data.js`. Os dois têm de ser iguais.

| Pacote | Diamantes | Stars |
|---|---|---|
| p100 | 100 | 75 ⭐ |
| p550 | 550 | 350 ⭐ |
| p1200 | 1200 | 700 ⭐ |

## Segurança: o que está e não está protegido

- **Protegido:** diamantes comprados, gastos de diamantes e baús de vault. O servidor é a fonte da verdade e ignora valores editados no telemóvel.
- **Limitado:** diamantes ganhos a jogar (missões e Overlord) são reportados pelo jogo. Por isso há um teto diário (`DAILY_EARN_CAP`, 60 por dia por defeito).
- **Não protegido:** ouro, itens e nível continuam no telemóvel. É um jogo para um só jogador, por isso batotas aí não custam dinheiro a ninguém. Um modo multijogador exigiria mover a lógica do jogo para o servidor.

## Testes

```bash
cd server
npm test
```

Os testes correm o servidor contra um Telegram falso. Cobrem sessões falsificadas, a compra completa com Stars (creditada uma única vez), gastos, limite diário, save na nuvem e reembolsos.
