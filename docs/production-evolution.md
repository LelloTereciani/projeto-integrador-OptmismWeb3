# Evolução para produção — arquitetura considerada, fora do MVP

## Propósito desta seção

Este documento registra como o desenho poderia evoluir de uma demonstração em testnet para um produto financeiro real. Nenhum componente descrito aqui está implementado no repositório, validado em produção ou oferecido como serviço financeiro.

Ele evidencia que o MVP foi delimitado conscientemente: a simplificação de testnet preserva a demonstração de L1, L2, contratos, carteira e recibos sem ignorar os requisitos que surgem quando há ativos, clientes e operações reais.

## 1. Autorização de pagamentos

Um pagamento real exige autorização válida do cliente, mas não precisa exigir uma confirmação manual para cada etapa técnica.

| Modelo | Uso | Controles mínimos |
| --- | --- | --- |
| Aprovação transação a transação | Pagamentos pontuais ou de alto risco | Revisão humana, resumo completo, destinatário, valor, taxa e confirmação explícita |
| Autorização prévia por política | Recorrência ou operações dentro de limites corporativos | Beneficiários permitidos, moeda, valor máximo, periodicidade, expiração, nonce, revogação e trilha de auditoria |
| Fluxo corporativo com múltiplas aprovações | Operações empresariais de maior valor | Separação de funções, limiares, aprovação em dois ou mais níveis e segregação de funções |

O MVP usa apenas aprovação manual por transação. Não existe delegação persistente, assinatura automática nem aprovação ilimitada.

## 2. Automação on-chain futura

Uma evolução não custodial pode usar smart accounts e account abstraction. Nesse modelo, o usuário assina uma autorização restrita e a conta programável valida cada operação contra regras como limite de valor, prazo, chain ID, destinatários e nonce. Um serviço pode transmitir a operação, mas não deve possuir um poder genérico de movimentar fundos.

O padrão [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) permite que uma smart account defina sua própria lógica de validação. A adoção exigiria análise de implementação, EntryPoint, bundler, recuperação de conta, revogação, paymaster quando aplicável e auditoria específica. Não basta trocar uma carteira EOA por uma smart account.

`permit` de ERC-20 poderia reduzir uma transação de aprovação em alguns tokens, mas continuaria sendo uma autorização que exige escopo, domínio, nonce, prazo e proteção contra replay. [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612)

## 3. Custódia e assinaturas corporativas

Uma plataforma de produção precisa escolher e documentar seu modelo:

- **Não custodial:** a empresa cliente mantém controle das chaves; a aplicação orienta e verifica, sem assinar em nome dela.
- **Custodial ou semi-custodial:** a operação exige política de guarda de chaves, HSM ou MPC, segregação de contas, limites, reconciliação, recuperação, monitoramento, resposta a incidentes e responsabilidades regulatórias adequadas.

Esses modelos não devem ser misturados de forma implícita. O backend do MVP não assina transações e não é uma base para custódia.

## 4. Liquidação financeira e parceiros

O `MockUSD` do MVP não substitui uma stablecoin, uma conta de pagamento, câmbio ou um pagamento a fornecedor. Em produção, a arquitetura precisaria integrar parceiros devidamente habilitados para a jurisdição e o produto, com contratos operacionais e validação jurídica independente.

Os módulos de cotação, execução de câmbio, conta transacional e payout bancário precisariam ser sistemas separados, com confirmação assinada pelo parceiro, tratamento de falhas, conciliação e estado idempotente. A tela só poderia afirmar liquidação local após evidência da etapa externa correspondente.

## 5. Segurança, privacidade e confiabilidade

| Área | Evolução necessária |
| --- | --- |
| Smart contracts | Revisão independente, auditoria proporcional ao valor, monitoramento de eventos e gestão de vulnerabilidades |
| Chaves | Políticas de acesso mínimo, HSM/MPC quando houver custódia, rotação, recuperação testada e logs imutáveis |
| Operações | Idempotência, filas ou workers controlados, reconciliação de recibos e reprocessamento seguro |
| Dados | Minimização, criptografia adequada, retenção, controle de acesso e avaliação de LGPD aplicável |
| Risco financeiro | Limites, regras de beneficiário, análise de fraude, sanções e aprovação humana para exceções |
| Disponibilidade | Monitoramento, alertas, backups, testes de restauração, gestão de incidentes e plano de continuidade |

O MVP demonstra apenas o princípio de reconciliação por recibo on-chain. Não implementa esses controles operacionais ou financeiros.

## 6. Critério para sair de testnet

Uma migração para produção não seria uma troca de RPC. Ela só poderia ser considerada após definição do modelo de custódia, parceiros financeiros, requisitos legais aplicáveis, threat model, auditoria de contratos, política de chaves, observabilidade, resposta a incidentes, testes de recuperação e aprovação explícita de cada etapa de implantação.
