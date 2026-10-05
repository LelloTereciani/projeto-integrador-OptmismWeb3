# Frontend do MVP

## Decisão

O frontend é uma aplicação web de página única, responsiva e em português, construída com Next.js 16, React 19 e TypeScript. Usa Wagmi 3 para o ciclo de carteira e Viem 2 para tipos EVM, unidades, ABIs, leituras e recibos. As versões instaladas são fixadas pelo `pnpm-lock.yaml`.

O MVP suporta somente uma carteira injetada no navegador, como MetaMask. Isso evita configurar WalletConnect, não exige uma chave de projeto e mantém a demonstração reduzida a uma integração de carteira verificável.

## Redes permitidas

| Etapa | Rede exigida | Chain ID |
| --- | --- | --- |
| Depósito opcional | Ethereum Sepolia | `11155111` |
| Registro, aprovação e liquidação | OP Sepolia | `11155420` |

A configuração de carteira terá allowlist exclusiva dessas duas redes. A aplicação não pede conexão automática, não troca de rede silenciosamente e não abre uma solicitação de assinatura sem clique explícito.

## Jornada em uma página

1. **Cabeçalho de ambiente:** aviso permanente `Ambiente de demonstração — sem dinheiro real`, rede atual, endereço abreviado e botão de conexão.
2. **Cenário de fatura fictícia:** formulário mínimo com valor em BRL e endereços EVM de teste do pagador e beneficiário. Não coleta número, texto, arquivo nem dados reais de fatura. O backend calcula a cotação e a tarifa determinísticas antes da aprovação comercial.
3. **Linha de progresso:** mostra estados de negócio, saldo L2 existente ou L1 → L2 opcional e payout fictício sem misturá-los.
4. **Ações de carteira:** cada ação mostra rede, contrato/bridge de destino, token, endereço relevante e valor exato antes de abrir a carteira.
5. **Revisão e próxima ação:** a revisão dos endereços, rede e valor aparece antes do botão que pode abrir a carteira. Verificações de recibo e o payout simulado são identificados como ações sem assinatura.
6. **Resultado:** após a liquidação, um card logo abaixo da revisão informa valor recebido, beneficiário, contrato do token, saldos L2 de ambas as contas, link da transferência, opção de adicionar MUSD à MetaMask e os limites do payout simulado.
7. **Provas técnicas:** cards para hash L1, hash/estado do crédito L2, transações de `PaymentRegistry`, evento `PaymentSettled`, chain ID e link de explorador.

## Sequência de ações de carteira

| Ordem | Ação | Rede | Evidência exigida antes de avançar |
| ---: | --- | --- | --- |
| 1 | Conferir saldo de MUSD e ETH já disponíveis | OP Sepolia | leituras `balanceOf` e ETH; sem assinatura |
| 1a (opcional) | Depositar ETH de teste pelo Standard Bridge e confirmar crédito | Ethereum Sepolia → OP Sepolia | recibo L1 e evidência de relay/crédito L2 |
| 2 | Criar a operação no `PaymentRegistry` | OP Sepolia | recibo com `PaymentCreated` |
| 3 | Aprovar a operação no `PaymentRegistry` | OP Sepolia | recibo com `PaymentApproved` |
| 4 | Aprovar exatamente o valor de `MockUSD` para o `PaymentRegistry` | OP Sepolia | allowance lida novamente na cadeia |
| 5 | Liquidar a operação | OP Sepolia | recibo com `PaymentSettled` e estado `settled` relido do registro; uma jornada pública confirmou `19,8 MUSD` no saldo da beneficiária |
| 6 | Exibir payout local simulado e ler saldos L2 | Aplicação | etapa 5 confirmada |

Antes das ações que escrevem em contrato, o frontend valida conta, rede, destinatário, contrato, amount, calldata e estado atual. Para valores on-chain, usa `bigint` e conversão explícita de unidades; nunca `number` do JavaScript. A aprovação do ERC-20 será sempre pelo valor exato da operação, nunca ilimitada.

A cotação de `R$ 25,26` resulta em `5,000000 MUSD` com taxa fixa fictícia de `R$ 5,0000` por token e tarifa de `1%` arredondada para cima. O app mostra saldo insuficiente quando o valor cotado ultrapassa o `balanceOf` da pagadora, inclusive antes do depósito opcional. Depois da liquidação, o botão de pagamento inverso preenche uma nova fatura com pagadora e beneficiária trocadas. A MetaMask precisa selecionar a conta beneficiária em OP Sepolia e acompanhar o token MUSD para mostrar o saldo daquela conta.

## Estados e falhas de UX

Cada ação pode estar em: desconectada, rede errada, pronta, aguardando assinatura, enviada, confirmando, confirmada, rejeitada, revertida, substituída ou RPC indisponível. O hash aparece assim que uma transação é enviada, mas o sucesso depende do recibo e da nova leitura de estado.

O frontend deve:

- preservar o formulário após erro recuperável;
- impedir duplo envio enquanto a mesma etapa estiver pendente;
- interromper a etapa se conta ou rede mudar;
- explicar saldo insuficiente, allowance insuficiente, rejeição de carteira e transação revertida sem ocultar o estado técnico;
- exibir endereço completo, contrato, beneficiário, token e valor completo antes de qualquer assinatura;
- oferecer links de explorador para hashes confirmados e pendentes;
- funcionar por teclado, com foco visível, contraste suficiente, rótulos associados aos campos e status não dependentes somente de cor;
- adaptar endereços e valores longos a telas estreitas sem rolagem horizontal.

## Itens que o frontend não fará

O frontend não terá login, dashboard, painel administrativo, gerenciamento de múltiplas empresas, histórico multiusuário, WalletConnect, autenticação por assinatura, assinatura tipada, aprovação ilimitada, assinatura em carregamento de página, coleta de chaves, chat, notificações, tradução ou aplicativo nativo.
