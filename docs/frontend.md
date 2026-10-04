# Frontend do MVP

## Decisão

O frontend será uma aplicação web de página única, responsiva e em português, construída com React e TypeScript. Usará Wagmi para ciclo de carteira e escrita de contratos, e Viem para tipos EVM, unidades, ABIs, leituras e recibos. As versões exatas serão definidas no início da implementação com base na documentação atual dos projetos.

O MVP suporta somente uma carteira injetada no navegador, como MetaMask. Isso evita configurar WalletConnect, não exige uma chave de projeto e mantém a demonstração reduzida a uma integração de carteira verificável.

## Redes permitidas

| Etapa | Rede exigida | Chain ID |
| --- | --- | --- |
| Depósito | Ethereum Sepolia | `11155111` |
| Registro, aprovação e liquidação | OP Sepolia | `11155420` |

A configuração de carteira terá allowlist exclusiva dessas duas redes. A aplicação não pede conexão automática, não troca de rede silenciosamente e não abre uma solicitação de assinatura sem clique explícito.

## Jornada em uma página

1. **Cabeçalho de ambiente:** aviso permanente `Ambiente de demonstração — sem dinheiro real`, rede atual, endereço abreviado e botão de conexão.
2. **Fatura fictícia:** formulário com dados de demonstração, BRL, beneficiário e endereço EVM de teste. O backend calcula a cotação e a tarifa determinísticas e as devolve para exibição antes da aprovação comercial.
3. **Linha de progresso:** mostra estados de negócio, L1, L2 e payout fictício sem misturá-los.
4. **Ações de carteira:** cada ação mostra rede, contrato/bridge de destino, token, endereço relevante e valor exato antes de abrir a carteira.
5. **Provas técnicas:** cards para hash L1, hash/estado do crédito L2, transações de `PaymentRegistry`, evento `PaymentSettled`, chain ID e link de explorador.

## Sequência de ações de carteira

| Ordem | Ação | Rede | Evidência exigida antes de avançar |
| ---: | --- | --- | --- |
| 1 | Depositar ETH de teste pelo Standard Bridge | Ethereum Sepolia | recibo L1 e status do depósito pendente |
| 2 | Confirmar crédito do depósito | OP Sepolia | evidência de relay/crédito L2 |
| 3 | Criar a operação no `PaymentRegistry` | OP Sepolia | recibo com `PaymentCreated` |
| 4 | Aprovar a operação no `PaymentRegistry` | OP Sepolia | recibo com `PaymentApproved` |
| 5 | Aprovar exatamente o valor de `MockUSD` para o `PaymentRegistry` | OP Sepolia | allowance lida novamente na cadeia |
| 6 | Liquidar a operação | OP Sepolia | recibo com `PaymentSettled` e saldo do beneficiário atualizado |
| 7 | Exibir payout local simulado | Aplicação | etapa 6 confirmada |

Antes das ações que escrevem em contrato, o frontend valida conta, rede, destinatário, contrato, amount, calldata e estado atual. Para valores on-chain, usa `bigint` e conversão explícita de unidades; nunca `number` do JavaScript. A aprovação do ERC-20 será sempre pelo valor exato da operação, nunca ilimitada.

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
