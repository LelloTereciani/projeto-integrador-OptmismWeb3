# Escopo explícito do MVP

## Compromisso do projeto

O projeto é uma demonstração educacional e de portfólio executada somente em Ethereum Sepolia e OP Sepolia. Nenhum texto, tela ou estado da aplicação deve sugerir que houve câmbio, remessa, liquidação bancária, custódia ou pagamento internacional real.

## Como ler este documento

- **Incluído** descreve comportamento planejado para o MVP. Não significa que já exista código ou evidência de testnet.
- **Fora do MVP** descreve funcionalidades que não serão implementadas neste release, mesmo se forem comuns em produtos financeiros ou Web3.
- O estado real do repositório está no `README.md`; o plano de execução e suas tarefas ainda pendentes estão em `docs/implementation-plan.md`.
- Uma afirmação de implementação, teste, endereço, hash ou validação só pode aparecer no README após evidência verificável correspondente.
- A visão de evolução para produção está em `docs/production-evolution.md`. Ela descreve arquitetura futura e não altera os itens incluídos neste MVP.

## Incluído

- Uma operação B2B fictícia: cenário que representa uma fatura, endereços de teste do pagador e beneficiário, valor em BRL, cotação, tarifa e payout local fictícios. O MVP não registra número, texto nem arquivo de fatura.
- Fórmula local e determinística para a cotação e a tarifa; não há consulta a uma taxa de mercado.
- Depósito opcional de ETH de teste da Ethereum Sepolia para a OP Sepolia pelo Standard Bridge, demonstrado separadamente do pagamento L2.
- Contratos `MockUSD` e `PaymentRegistry` na OP Sepolia, com operações e eventos verificáveis.
- Carteiras EVM de teste, transações assinadas pelo usuário e evidência em exploradores.
- Backend mínimo para dados comerciais fictícios, referências de transação e recomposição de estados observáveis.
- Aplicação web responsiva em português para executar e explicar o percurso.

## Fora do MVP

### Financeiro, bancário e regulatório

- Valores reais, fiat, stablecoins reais, depósitos de clientes, resgate, venda ou compra de tokens.
- Cotação de mercado, conversão BRL/USD real, spread, liquidação cambial ou qualquer provedor de FX.
- PIX, SWIFT, ACH, TED, banco, instituição de pagamento, conta de fornecedor ou payout bancário.
- KYC, KYB, AML, sanções, monitoramento de fraude, compliance regulatório, emissão de nota fiscal ou validade jurídica da fatura.
- Empresas, pessoas, CNPJ, documentos, e-mails, dados bancários ou faturas reais.

### Carteira e custódia

- Chaves privadas, seed phrases, recuperação de carteira, carteira custodial, assinatura pelo servidor ou assinatura automática.
- WalletConnect, hardware wallets, Safe, account abstraction, paymasters, gas sponsorship e relayers.
- Login, conta de usuário, equipes, papéis, multiempresa, permissões administrativas de produto e recuperação de acesso.

### Blockchain e protocolos

- Mainnet, OP Goerli, outras L1/L2, outros rollups e qualquer implementação adicional de `RollupAdapter`.
- Criação de `MockUSD` na Ethereum Sepolia, bridge de `MockUSD`, token bridged customizado ou representação `IOptimismMintableERC20`.
- Saque L2 → L1, prova de saque, challenge period, sequencer, batcher, proposer, validator ou operação de infraestrutura OP Stack.
- DEX, swap, oracle, preço on-chain, CCTP, ponte de terceiros, tokenização, escrow, reembolso, cancelamento, disputa, parcelamento, lote, streaming ou recorrência.
- Proxy, upgrade, governança, multisig de produção ou auditoria independente de smart contracts.

### Aplicação, integrações e operação

- ERP, contabilidade, CRM, e-mail, webhook, API pública, notificações, fila, jobs agendados, relatórios ou exportação de dados.
- Upload e armazenamento de documentos, anexos, comprovantes ou dados pessoais.
- Aplicativo mobile nativo, suporte multilíngue, painel administrativo, tema customizável ou analytics de usuários.
- Produção, domínio público, monitoramento, observabilidade operacional, SLA, backup de dados reais, CI que execute transações em testnet ou secrets de deploy.

## Regras de interpretação

- `MockUSD` é um ERC-20 de teste na OP Sepolia. Não é USDC, dólar, stablecoin ou representação bridged.
- `Payout local simulado` é uma conclusão visual após o recibo de `PaymentSettled`; não chama um serviço externo e não movimenta moeda.
- Um hash enviado não significa sucesso: a aplicação só marca etapas on-chain como concluídas após o recibo correspondente.
- Um depósito de ETH na L1 e uma liquidação de `MockUSD` na L2 são transações independentes, mostradas na mesma jornada para explicar a arquitetura do rollup.
