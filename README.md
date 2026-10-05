# Orquestrador de pagamentos internacionais para PMEs, com liquidação demonstrativa em Optimism

> Projeto de portfólio, inteiramente em testnet. Não recebe dinheiro real, dados bancários ou chaves privadas.

O aplicativo demonstra um **cenário fictício** de pagamento B2B: calcula uma cotação fixa a partir de um valor em BRL, registra a aprovação comercial, acompanha um depósito de ETH de teste da Ethereum Sepolia para a OP Sepolia e conduz a liquidação de `MockUSD` de teste na OP Sepolia. A conversão monetária e o pagamento bancário ao fornecedor são apenas representações na interface. O depósito de ETH e a transferência de `MockUSD` são transações independentes; o token não é bridged.

## Estado comprovado do repositório

| Componente | Estado |
| --- | --- |
| Frontend responsivo em português, carteira injetada, cotação, progresso e links de explorador | Implementado; testado localmente |
| Backend HTTP, cotação determinística e persistência SQLite de cenários fictícios | Implementado; testado localmente |
| Verificação de recibos, eventos e estado na Ethereum Sepolia e OP Sepolia | Implementada; testada com respostas de RPC controladas |
| `MockUSD` e `PaymentRegistry` | Implementados, compilados e testados em rede local Hardhat |
| Testes unitários e de integração locais | Implementados: 19 do modelo compartilhado, 109 do web/backend e 18 dos contratos |
| Teste de navegador da jornada completa | Implementado e aprovado com carteira, RPC e API simulados |
| Deploy e jornada manual nas testnets públicas | **Pendentes de nova autorização e execução** |
| Endereços, hashes, blocos, saldo do beneficiário e verificação de código-fonte públicos | **Ainda sem evidência; não foram inventados** |

Os testes de navegador exercitam a integração da interface com respostas controladas. Eles não comprovam uma transação pública. Até a jornada manual, a ação on-chain do aplicativo depende de endereços de contratos ainda não configurados. O formulário e a cotação podem ser executados localmente sem esses endereços; ações de carteira exibem erro de configuração.

## O que o MVP implementa

1. Formulário mínimo que representa uma fatura fictícia com carteira pagadora, carteira beneficiária e valor fictício em BRL. Não há número, texto, arquivo ou identificação real de fatura.
2. Cotação fixa de `R$ 5,0000` por `MockUSD` e tarifa fictícia de `1%`, calculadas no servidor com aritmética inteira.
3. Aprovação comercial explícita, separada das assinaturas da carteira.
4. Depósito de `0,0001` ETH de teste pelo Standard Bridge na Ethereum Sepolia e verificação separada do crédito na OP Sepolia.
5. Criação, aprovação e liquidação de uma operação no `PaymentRegistry`; `MockUSD.approve` limita a autorização ao valor exato e ao contrato do registro.
6. Verificação no backend de rede, recibo, evento, argumentos e estado antes de avançar; exibição de hash, chain ID, bloco, status e explorador.
7. Conclusão visual de payout local fictício somente depois da liquidação confirmada na L2.

| Rede | Papel | Chain ID |
| --- | --- | --- |
| Ethereum Sepolia | Origem do depósito de ETH de teste | `11155111` |
| OP Sepolia | Crédito do depósito e liquidação de `MockUSD` | `11155420` |

`MockUSD` é um ERC-20 de demonstração com seis casas decimais. **Não é USDC, dólar ou stablecoin e não possui valor monetário.** O emissor de teste precisa distribuir o token à carteira pagadora após um eventual deploy. O aplicativo não faz mint automático.

## Executar localmente

Requisitos: Node.js `22.13.0+`, pnpm `11.18.0` e uma carteira EIP-1193 injetada para ações on-chain. Na raiz do repositório:

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm --filter @payment-demo/web exec next dev
```

Abra `http://localhost:3000`. O SQLite é criado automaticamente em `apps/web/payment-demo.sqlite` no comando acima, ou no caminho definido por `PAYMENT_DB_PATH`. O arquivo é ignorado pelo Git. RPCs públicos de teste têm valores padrão no código e podem ser substituídos pelas variáveis de `.env.example`.

`NEXT_PUBLIC_MOCK_USD_ADDRESS` e `NEXT_PUBLIC_PAYMENT_REGISTRY_ADDRESS` ficam vazios até o deploy autorizado e verificado em OP Sepolia. Depois de configurar endereços reais, reinicie o servidor para atualizar o frontend. Não coloque chaves privadas na aplicação web; `OP_SEPOLIA_PRIVATE_KEY` é exclusiva dos scripts manuais de deploy/mint e deve permanecer em ambiente local ignorado pelo Git.

## Verificação local

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @payment-demo/contracts lint
pnpm --filter @payment-demo/web lint
pnpm --filter @payment-demo/web db:check
pnpm --filter @payment-demo/web test:e2e
```

`pnpm test` inclui testes de domínio, rotas, SQLite, recibos/eventos, estados de carteira e contratos na rede Hardhat simulada. `test:e2e` usa Playwright/Chromium e mocks determinísticos de carteira, RPC e API; na primeira execução, instale o navegador com `pnpm --filter @payment-demo/web exec playwright install chromium`. Nenhum teste envia fundos ou transações para testnets públicas.

## Limites explícitos

- Não há transferência de reais ou dólares, câmbio de mercado, banco, payout real, fornecedor real, KYC/KYB/AML ou documentos.
- Não há autenticação de usuário, custódia, assinatura automática, relayer, WalletConnect, saque L2 → L1, bridge de `MockUSD` ou suporte a outros rollups.
- O SQLite local guarda somente o cenário fictício e referências públicas de transações. Este MVP não oferece gestão multiusuário nem proteção operacional para dados financeiros reais.
- O contrato não faz swap, conversão ou pagamento internacional. Ele registra e transfere o token de teste entre carteiras na OP Sepolia.
- O projeto usa a rede Optimism; não opera um sequencer, batcher nem constrói um rollup próprio.

A lista detalhada do que entra e do que fica fora está em [docs/mvp-scope.md](docs/mvp-scope.md). A arquitetura e os estados estão em [docs/design.md](docs/design.md), a interface em [docs/frontend.md](docs/frontend.md) e as tarefas e pendências em [docs/implementation-plan.md](docs/implementation-plan.md). [docs/deployment-evidence.md](docs/deployment-evidence.md) permanece como modelo sem endereços ou hashes até uma validação manual pública.

## Evolução para produção — conhecimento arquitetural, fora do MVP

Um produto financeiro real exigiria parceiros autorizados para entrada de recursos, câmbio e payout, conciliação, KYC/KYB/AML, privacidade e controles regulatórios. Para autorizações programáveis, a assinatura manual poderia evoluir para smart accounts com políticas de valor máximo, prazo, beneficiários permitidos, nonce, revogação e múltiplas aprovações corporativas. Isso exige decisão explícita sobre custódia, gestão de chaves, auditoria independente dos contratos, monitoramento, resposta a incidentes e testes de segurança e operação adequados.

Essas capacidades são **propostas de evolução**: não estão implementadas, testadas nem disponíveis neste repositório. Veja [docs/production-evolution.md](docs/production-evolution.md).
