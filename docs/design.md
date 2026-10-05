# Orquestrador de pagamentos internacionais para PMEs — design do MVP

**Status:** implementação local, deploy dos contratos e uma jornada pública L1 → L2 → liquidação de MockUSD confirmados em 2026-10-05; payout bancário apenas simulado

## 1. Objetivo e limites

Construir uma demonstração de portfólio de um pagamento B2B internacional, inteiramente em testnet. O percurso prova dois fatos técnicos distintos:

1. Uma carteira pode depositar ETH de teste da Ethereum Sepolia na OP Sepolia usando o Standard Bridge da Optimism.
2. A mesma carteira pode liquidar um valor de teste, em um ERC-20 chamado `MockUSD`, para uma carteira beneficiária na OP Sepolia.

O produto não é uma plataforma de remessas e não movimenta ativos, dados bancários, câmbio ou dinheiro reais. Empresas, faturas, valores, cotações e etapas bancárias são dados fictícios. O backend não recebe, guarda ou assina chaves privadas.

## 2. Decisões arquiteturais

| Tema | Decisão |
| --- | --- |
| L1 | Ethereum Sepolia (`chainId` 11155111) |
| L2 | OP Sepolia (`chainId` 11155420) |
| Demonstração de rollup | Depositar `SepoliaETH` de teste da L1 para a L2 pelo Standard Bridge e acompanhar os dois lados do processo |
| Liquidação demonstrativa | Transferir `MockUSD` entre duas carteiras de teste na OP Sepolia |
| Custódia | Nenhuma. O usuário assina cada transação com sua carteira |
| Dados comerciais | Fictícios e fora da blockchain |
| Câmbio e tarifas | Fórmula local determinística, sem provedor externo |
| Backend | Registra o cenário, o histórico da interface e referências às transações; não é fonte de verdade para saldos ou confirmações on-chain |
| Extensibilidade | Porta interna `PaymentChainVerifier` e implementação de verificação `OptimismAdapter`; outros rollups exigiriam nova implementação e revisão do fluxo |

`SepoliaETH` e o ETH de teste na OP Sepolia representam saldos na mesma carteira em redes diferentes. O depósito reduz o saldo na L1 e credita o saldo na L2 após o relay. Isso é independente de `MockUSD` e não cria uma conversão de moeda.

O `MockUSD` de teste precisa ser emitido pelo dono do contrato para a carteira pagadora antes da liquidação. O caminho direto lê `balanceOf` e ETH da pagadora na OP Sepolia antes das assinaturas. O depósito L1 → L2 é uma etapa didática opcional; o contrato `PaymentRegistry` não exige esse depósito e não associa seu ETH ao token. A interface exibe o saldo de MUSD insuficiente para a cotação e também confere o saldo antes de qualquer depósito opcional, criação ou liquidação.

## 3. Escopo da demonstração

### Incluído

- Cadastro de um cenário que representa uma fatura fictícia: valor em BRL e endereços de carteiras de teste do pagador e beneficiário. Não há campos de número, texto ou arquivo de fatura.
- Simulação determinística de taxa BRL/USD, tarifa e valor líquido em `MockUSD`.
- Confirmação comercial explícita do pagador na interface.
- Conexão de carteira e troca guiada entre Ethereum Sepolia e OP Sepolia.
- Depósito opcional de uma quantidade pequena de ETH de teste da L1 para a L2.
- Acompanhamento do depósito: enviado na L1, relay pendente e disponível na L2.
- Aprovação ERC-20 e liquidação real de `MockUSD` na OP Sepolia.
- Eventos, hashes, chain IDs, status e links aos exploradores das transações.
- Status visual final de `Payout local simulado`, criado somente após a confirmação da liquidação L2.

### Excluído

- Fiat, stablecoins, bancos, provedores de câmbio, KYC, cadastro de empresas reais ou pagamentos a fornecedores reais.
- Custódia, contas internas, saque, reembolso, escrow, parcelamento, lote de pagamentos, relayers e gas sponsorship.
- Bridge de `MockUSD`, token em Ethereum Sepolia ou token customizado compatível com o Standard Bridge.
- Operação de sequencer, batcher, proposer ou qualquer componente de infraestrutura do OP Stack.
- Suporte funcional a outros rollups no primeiro release.

`docs/mvp-scope.md` é a lista normativa dos itens fora do MVP. Uma funcionalidade nessa lista não será inferida como incluída por telas, contratos, nomes de estados ou documentação de arquitetura.

## 4. Fluxo de produto e estados

```text
Rascunho
  → Cotado (simulação calculada no servidor)
  → Aprovado comercialmente
  → Escolher saldo L2 existente ou depósito opcional
     → [saldo existente] MUSD e ETH conferidos na OP Sepolia
     → [bridge opcional] Depósito L1 enviado → Aguardando crédito → ETH disponível na L2
  → Operação criada no PaymentRegistry
  → Operação aprovada pelo pagador
  → Valor exato de MockUSD aprovado para o PaymentRegistry
  → Liquidação L2 enviada
  → Liquidado na L2
  → Payout local simulado
```

Os estados `Rascunho`, `Cotado`, `Aprovado comercialmente`, `Saldo L2 conferido` e `Payout local simulado` são estados da aplicação. A conferência do saldo L2 é uma leitura on-chain, sem transação nem assinatura. Os demais avanços dependem de evidência on-chain confirmada pelo backend.

A tela apresenta os estágios em três blocos sem misturá-los:

1. **L1 — Ethereum Sepolia (opcional):** hash do depósito e confirmação na L1 quando a bridge é escolhida.
2. **L2 — OP Sepolia:** saldo existente ou crédito do depósito e transação de liquidação com o evento `PaymentSettled`.
3. **Simulação off-chain:** conversão e payout local fictícios.

## 5. Contratos

### MockUSD

Token ERC-20 de teste na OP Sepolia. Será baseado em componentes OpenZeppelin atuais, com símbolo e avisos explícitos de que não é USDC, não é stablecoin e não tem valor monetário.

O contrato terá um emissor administrativo exclusivo para abastecer previamente as carteiras demonstrativas. Esse poder existe apenas em testnet e será exibido na documentação. Não haverá mecanismo de venda, resgate ou ponte do token.

### PaymentRegistry

Contrato na OP Sepolia que registra e liquida uma operação sem dados pessoais ou texto de fatura. A operação contém:

- `paymentId`: identificador aleatório de 32 bytes, único por operação;
- `payer` e `beneficiary`: endereços de teste;
- `amount`: valor em unidades de `MockUSD`;
- `termsHash`: hash de uma representação canônica dos termos comerciais fictícios;
- estado on-chain: criada, aprovada e liquidada.

Interface proposta:

```solidity
createPayment(bytes32 paymentId, address beneficiary, uint256 amount, bytes32 termsHash)
approvePayment(bytes32 paymentId)
settlePayment(bytes32 paymentId)
```

Somente o pagador cria e aprova sua operação. `settlePayment` só aceita uma operação aprovada e usa `SafeERC20.safeTransferFrom(payer, beneficiary, amount)`. Portanto, o pagador também precisa executar a aprovação ERC-20 para o registro antes da liquidação. O contrato não mantém saldo de clientes.

Eventos mínimos:

```solidity
PaymentCreated(bytes32 indexed paymentId, address indexed payer, address indexed beneficiary, uint256 amount, bytes32 termsHash)
PaymentApproved(bytes32 indexed paymentId, address indexed payer)
PaymentSettled(bytes32 indexed paymentId, address indexed payer, address indexed beneficiary, uint256 amount)
```

Invariantes obrigatórios: `paymentId` não pode ser reutilizado; somente o pagador modifica a operação; uma operação só é liquidada uma vez; não se liquida valor zero; falha de allowance ou saldo reverte a transação inteira; token aceito é imutável.

## 6. Aplicação e fronteiras

### Frontend

Uma única jornada de demonstração mostra o formulário fictício, a cotação, os estados, a conexão de carteira e os links de prova. A interface bloqueia a próxima ação até haver a confirmação necessária e explica a rede que a carteira deve selecionar. O frontend será React e TypeScript, com Wagmi para carteira e escritas de contrato, e Viem para leituras, recibos e unidades EVM. Somente uma carteira injetada será suportada no MVP.

Toda tela que mostrar valor precisa exibir o rótulo `Ambiente de demonstração — sem dinheiro real`. A confirmação comercial é uma ação de produto e não substitui a assinatura das transações de carteira.

`docs/frontend.md` define telas, ações, estados, regras de assinatura, responsividade e acessibilidade do frontend.

### Backend

Armazena apenas os dados fictícios do cenário e referências verificáveis: `paymentId`, hashes de transação, chain ID, endereços públicos, timestamps observados e estados derivados. Não há armazenamento de fatura completa; somente `termsHash` é publicado na blockchain.

A cotação local usa uma taxa fixa, controlada pelo servidor, de `R$ 5,0000 por MockUSD` (`50.000` pontos-base) e uma tarifa fictícia de `1,00%` (`100` pontos-base). A tarifa é arredondada para cima ao centavo e o valor líquido convertido é arredondado para baixo à menor unidade de `MockUSD`, que possui seis casas decimais. Todos os cálculos usam `bigint`; valores de taxa ou tarifa enviados pelo navegador não alteram a cotação, a persistência ou o `termsHash`.

Para o primeiro release, o backend trata uma transação como confirmada somente depois de obter o recibo da rede correspondente. Em caso de queda, a interface pode reconsultar o hash e recompor o estado. Ele nunca altera um status on-chain com base apenas em uma requisição do navegador.

### Adaptação ao rollup

O frontend envia o depósito e as ações de contrato por uma carteira injetada. No servidor, `PaymentChainVerifier` define as leituras exigidas pelo serviço de transações; `OptimismAdapter` verifica o bridge L1, o crédito L2, recibos e eventos dos contratos da OP Sepolia. URLs dos exploradores ficam em um módulo separado. Essa separação permite avaliar outro rollup no futuro, mas **não** constitui suporte atual a outras redes.

## 7. Tratamento de erros

| Situação | Comportamento esperado |
| --- | --- |
| Carteira em rede errada | Solicitar a troca para Sepolia ou OP Sepolia conforme a etapa; não enviar a transação |
| Saldo insuficiente de ETH | Exibir a rede que precisa de ETH de teste e manter a ação indisponível |
| Depósito opcional ainda sem relay | Manter estado pendente, hash L1 acessível e ação de atualização; não iniciar a liquidação desse cenário antes de confirmar o crédito |
| Sem MockUSD ou allowance | Exibir saldo necessário e disponível antes de abrir a carteira; explicar a aprovação exata; não ocultar o erro retornado pela carteira |
| `paymentId` duplicado | Tratar como erro permanente e criar uma nova operação fictícia |
| Transação revertida ou rejeitada | Registrar o status observável, manter dados do cenário e permitir tentativa explícita da etapa ainda válida |
| RPC indisponível | Informar indisponibilidade de leitura e preservar hashes já conhecidos |

## 8. Critérios de aceite

1. A aplicação deixa inequívoco que todo o fluxo usa Ethereum Sepolia e OP Sepolia, com ativos sem valor real.
2. Um avaliador consegue abrir o hash da liquidação na L2 e, quando a bridge opcional for usada, o hash do depósito na L1 em exploradores públicos.
3. O depósito mostra origem L1, destino L2 e o estado de crédito na L2 sem alegar que `MockUSD` foi bridged.
4. A liquidação emite `PaymentSettled`, transfere a quantidade exata de `MockUSD` e aumenta o saldo da carteira beneficiária pelo mesmo valor.
5. A blockchain não recebe CNPJ, razão social, dados bancários, texto de fatura, e-mail ou dados pessoais.
6. O backend não contém chaves privadas nem assina transações em nome do usuário.
7. Nenhuma etapa off-chain é descrita como operação financeira real.

## 9. Estratégia de verificação

- Testes de unidade dos contratos para permissões, transições, duplicidade, valor zero, saldo insuficiente e allowance insuficiente.
- Testes de interface para fórmula de cotação, mapeamento de estados e mensagens de erro.
- Testes do adaptador com respostas de RPC controladas para depósito pendente, confirmado e falho.
- Execução manual de ponta a ponta em testnet com hashes anotados no README: depósito L1, confirmação/recebimento L2 e liquidação L2.
- Verificação visual da interface em carteira conectada, incluindo troca de rede e links aos exploradores.

## 10. Referências técnicas

- [Standard Bridge da Optimism](https://docs.optimism.io/app-developers/guides/bridging/standard-bridge): ETH e ERC-20 entre L1 e L2; tokens ERC-20 bridged requerem representação no destino.
- [Especificação de depósitos do OP Stack](https://specs.optimism.io/protocol/deposits.html): um depósito é iniciado na L1 e executado na L2.
