# Orquestrador de pagamentos internacionais para PMEs, com liquidação demonstrativa em Optimism

> Ambiente educacional e de portfólio. Todo o fluxo usa testnets e ativos sem valor monetário.

Este projeto demonstra um fluxo B2B fictício entre uma empresa pagadora brasileira e um fornecedor estrangeiro. A aplicação registra a fatura fictícia, calcula uma cotação simulada, solicita a aprovação do pagador e apresenta uma liquidação demonstrativa na OP Sepolia.

## Estado atual

O workspace pnpm, o modelo compartilhado e os contratos locais estão implementados. `MockUSD` e `PaymentRegistry` foram compilados e testados apenas na rede simulada do Hardhat; nenhum contrato foi implantado e nenhuma transação foi enviada a uma testnet.

| Item planejado | Estado atual |
| --- | --- |
| Especificação funcional e limites do MVP | Documentado |
| Plano técnico de frontend, backend, contratos e testes | Documentado e aprovado |
| Workspace e dependências | Implementado localmente |
| Contratos `MockUSD` e `PaymentRegistry` | Implementados e testados localmente |
| Backend e persistência de cenários fictícios | Não implementado |
| Frontend e conexão de carteira | Não implementado |
| Testes unitários do modelo compartilhado | Implementados |
| Testes unitários e de integração dos contratos | Implementados na rede local simulada |
| Testes de backend, frontend e E2E | Não implementados |
| Validação manual Ethereum Sepolia → OP Sepolia | Não executada |
| Endereços, hashes, blocos e verificação de código-fonte | Ainda inexistentes |

O arquivo [docs/implementation-plan.md](docs/implementation-plan.md) contém as tarefas em checklist. Uma tarefa só será marcada após sua implementação e verificação.

## Escopo do MVP

1. Um depósito de ETH de teste da Ethereum Sepolia para a OP Sepolia pelo Standard Bridge da Optimism.
2. Uma liquidação real de `MockUSD`, token ERC-20 sem valor monetário, entre duas carteiras de teste na OP Sepolia.
3. Eventos, hashes, redes, estados e links de exploradores para a avaliação técnica do fluxo L1 → L2.
4. Um backend que registra somente cenários fictícios e confirma estágios pela leitura de recibos e eventos.
5. Um frontend web que conecta uma carteira injetada, mostra cada assinatura e explica o estado de cada rede.

O depósito de ETH de teste e a transferência de `MockUSD` são etapas separadas. `MockUSD` existirá somente na OP Sepolia e não representa USDC, dólares ou qualquer ativo real.

## Redes

| Papel | Rede | Chain ID |
| --- | --- | --- |
| Camada 1 | Ethereum Sepolia | `11155111` |
| Rollup | OP Sepolia | `11155420` |

## O que não será implementado no MVP

- Não há dinheiro real, stablecoin real, banco, câmbio, KYC ou fornecedor real.
- Todas as empresas, faturas, valores, tarifas e etapas de payout são fictícias.
- O backend não guarda nem assina chaves privadas; cada transação é assinada pela carteira de teste do usuário.
- O status `Payout local simulado` é somente uma conclusão visual após a liquidação confirmada na L2.
- Não haverá bridge de `MockUSD`, saque L2 → L1, mainnet, WalletConnect, conta de usuário, relayer, escrow, reembolso, integração bancária, integração de câmbio, ERP, upload de documentos, aplicativo nativo ou dashboard administrativo.

A relação completa, organizada por domínio, está em [docs/mvp-scope.md](docs/mvp-scope.md). Itens fora do escopo não são prometidos implicitamente pela interface.

## Evolução para produção — visão técnica, fora do MVP

O projeto foi desenhado com uma visão além da demonstração. Em um produto real, a assinatura manual poderia evoluir para autorização prévia limitada por política, com valor máximo, prazo, beneficiários permitidos, revogação, nonce e múltiplas aprovações corporativas. Esse modelo preserva autorização do cliente sem conceder poder irrestrito de movimentação.

Uma futura arquitetura Web3 poderia adotar smart accounts e account abstraction, com validação programável de cada operação e submissão por infraestrutura especializada. Também exigiria uma decisão explícita entre autocustódia e custódia, além de parceiros financeiros habilitados para câmbio e payout, reconciliação externa, auditoria de contratos, gestão de chaves, privacidade, monitoramento e resposta a incidentes.

Esses itens demonstram o conhecimento arquitetural considerado no desenho, mas **não estão implementados, testados ou oferecidos por este repositório**. O detalhamento e a fronteira de produção estão em [docs/production-evolution.md](docs/production-evolution.md).

## Frontend

O MVP terá uma aplicação React e TypeScript, com Wagmi e Viem, conectando somente carteiras injetadas no navegador. Ela conduz o avaliador pelo depósito L1, ações de contrato na L2 e evidências em exploradores, com confirmação explícita para cada assinatura.

O detalhamento de telas, estados, acessibilidade, redes permitidas e ações de carteira está em [docs/frontend.md](docs/frontend.md).

## Verificação local

### Implementados

- Contratos: permissões, transições de estado, duplicidade de `paymentId`, valor zero, allowance, saldo insuficiente, emissão de eventos e transferência exata de `MockUSD`.
- Integração de contratos: `approve` do ERC-20, criação, aprovação e liquidação pelo `PaymentRegistry` usando uma rede local.
- Modelo compartilhado: parsing de valores atômicos, redes permitidas, estágios persistidos e relação obrigatória entre estágio e rede.

Os comandos locais são:

```bash
pnpm --filter @payment-demo/shared test
pnpm --filter @payment-demo/shared typecheck
pnpm --filter @payment-demo/contracts test
pnpm --filter @payment-demo/contracts build
pnpm --filter @payment-demo/contracts lint
```

### Planejados

- Aplicação: cálculo determinístico de cotação e tarifa, mapeamento de estados, troca de rede e mensagens para erros de carteira/RPC.
- Adaptador Optimism: respostas controladas para depósito pendente, confirmado e falho.

### Validação manual em testnet

O bridge deve ser validado manualmente em Ethereum Sepolia e OP Sepolia com carteiras de teste. A evidência final registrará os hashes do depósito L1, do crédito/relay na L2 e da liquidação `MockUSD`, com links de explorador. Esse teste não deve rodar automaticamente em CI, pois depende de faucet, RPC público, confirmação de rede e carteiras financiadas.

## Documentação de design

O design do MVP, os contratos, os estados, os limites e os critérios de aceite estão em [docs/design.md](docs/design.md).

O plano técnico de implementação, incluindo frontend, backend, contratos e testes, está em [docs/implementation-plan.md](docs/implementation-plan.md).

## Próximo estado esperado

O próximo estágio do plano é implementar o backend fictício e sua persistência local. Frontend, integração de carteira, E2E e validação manual em testnet continuam pendentes. O README será atualizado com resultados reais a cada etapa concluída.
