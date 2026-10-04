# Evidências de implantação e demonstração

**Estado:** pendente. Nenhum contrato foi implantado e nenhuma transação foi enviada a Ethereum Sepolia ou OP Sepolia neste projeto. A implantação exige nova autorização do usuário.

Este documento deve ser preenchido somente após observação dos recibos nas redes públicas de teste. Um hash enviado pela carteira, isoladamente, não comprova confirmação nem execução da etapa seguinte.

## Ambiente

| Campo | Valor verificado |
| --- | --- |
| Data e horário da demonstração | Pendente |
| Commit do código implantado | Pendente |
| Carteira de teste do pagador | Pendente |
| Carteira de teste do beneficiário | Pendente |
| Rede L1 | Ethereum Sepolia (`11155111`) |
| Rede L2 | OP Sepolia (`11155420`) |

## Contratos na OP Sepolia

| Evidência | `MockUSD` | `PaymentRegistry` |
| --- | --- | --- |
| Endereço | Pendente | Pendente |
| Hash de implantação | Pendente | Pendente |
| Bloco do recibo confirmado | Pendente | Pendente |
| Bytecode presente no endereço | Pendente | Pendente |
| Código-fonte verificado no explorador | Pendente | Pendente |
| Link do explorador | Pendente | Pendente |

## Jornada L1 → L2 → liquidação

| Etapa | Hash | Bloco e status do recibo | Evidência adicional | Link do explorador |
| --- | --- | --- | --- | --- |
| Depósito iniciado na Ethereum Sepolia | Pendente | Pendente | Emissor, destino e valor ETH de teste | Pendente |
| Crédito do depósito na OP Sepolia | Pendente | Pendente | Vínculo comprovado ao depósito L1 | Pendente |
| Mint demonstrativo de `MockUSD` | Pendente | Pendente | Saldo de teste do pagador | Pendente |
| `PaymentCreated` | Pendente | Pendente | `paymentId`, pagador, beneficiário, valor e `termsHash` | Pendente |
| `PaymentApproved` | Pendente | Pendente | `paymentId` e pagador | Pendente |
| `MockUSD.approve` | Pendente | Pendente | Spender `PaymentRegistry` e allowance exata | Pendente |
| `PaymentSettled` | Pendente | Pendente | Evento, estado do registro e saldo do beneficiário | Pendente |

## Revisão final

- [ ] Endereços e hashes correspondem ao commit indicado.
- [ ] Recibos têm status de sucesso e pertencem às redes corretas.
- [ ] Crédito L2 está vinculado ao depósito L1; o depósito L1 sozinho não é tratado como crédito L2.
- [ ] Eventos e estado de `PaymentRegistry` correspondem ao cenário fictício.
- [ ] O saldo de `MockUSD` do beneficiário reflete a liquidação.
- [ ] O README separa fatos verificados, pendências e etapas bancárias simuladas.
