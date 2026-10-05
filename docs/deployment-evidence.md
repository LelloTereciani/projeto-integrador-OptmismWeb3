# Evidências de implantação e demonstração

**Estado em 2026-10-05:** dois contratos implantados na OP Sepolia, com recibos de sucesso, bytecode presente e correspondência exata no Sourcify. O depósito de `0,0001 ETH` de teste da Ethereum Sepolia para a OP Sepolia foi confirmado nas duas redes e vinculado pelo `sourceHash`. O mint de `19,8 MockUSD` para a carteira pagadora também foi confirmado na OP Sepolia. A liquidação de demonstração continua pendente. A primeira tentativa de depósito L1 foi revertida e permanece documentada abaixo.

Os dados de deploy abaixo foram conferidos no RPC público da OP Sepolia (`eth_chainId`, `eth_getTransactionReceipt`, `eth_getCode` e `eth_call`), na API do Sourcify e na API do Blockscout. Um hash enviado pela carteira, isoladamente, não comprova confirmação nem execução da etapa seguinte. A tentativa de envio **direto** de código ao Blockscout pelo plugin Hardhat falhou sem chave Pro; depois, o Blockscout importou os fontes verificados pelo Sourcify e passou a marcar ambos como verificados.

## Ambiente

| Campo | Valor verificado |
| --- | --- |
| Data e horário do deploy | 2026-10-05, 13:35:12 e 13:35:26 UTC |
| Código-fonte público correspondente | Commit [`40f02e29e7d5b4a490eab1cab66f2b14e9c7e58c`](https://github.com/LelloTereciani/projeto-integrador-OptmismWeb3/commit/40f02e29e7d5b4a490eab1cab66f2b14e9c7e58c); os contratos, a configuração e o módulo Ignition não mudaram até o checkout local de deploy `78346701a2591bebb23d17333429409c85068dba`. |
| Carteira que implantou e emite o token | `0x90f10aD923cc949b1F000134702452821b44bef6` |
| Carteira de teste do pagador | `0x90f10aD923cc949b1F000134702452821b44bef6`, origem do depósito L1 confirmado |
| Carteira de teste do beneficiário | `0xa84dDfBFDB0b2dD8f15284E8511C32be936ffC37`, informada pelo usuário; recebimento ainda não comprovado |
| Rede L1 | Ethereum Sepolia (`11155111`) |
| Rede L2 | OP Sepolia (`11155420`) |

## Contratos na OP Sepolia

| Evidência | `MockUSD` | `PaymentRegistry` |
| --- | --- | --- |
| Endereço | `0x0202d5f1D5427BcA9d3aD546832B0D82fcd7aD92` | `0xEB8642297c98206502e8fc05f659e5a2b12b051c` |
| Hash de implantação | [`0x32ed67b19cd3cc04c8e563af0fa89ea1ff6340f7906203fae916ffa3580eb515`](https://optimism-sepolia.blockscout.com/tx/0x32ed67b19cd3cc04c8e563af0fa89ea1ff6340f7906203fae916ffa3580eb515) | [`0x1cc0244fadb409b9b47cd3f6786f0acb3e7c5fc24a35780f7018f5c5c0596321`](https://optimism-sepolia.blockscout.com/tx/0x1cc0244fadb409b9b47cd3f6786f0acb3e7c5fc24a35780f7018f5c5c0596321) |
| Bloco do recibo confirmado | `49702386`, status `1` | `49702393`, status `1` |
| Bytecode presente no endereço | Sim, `2222` bytes | Sim, `1676` bytes |
| Código-fonte no Sourcify | [Correspondência exata na criação e execução](https://sourcify.dev/server/repo-ui/11155420/0x0202d5f1D5427BcA9d3aD546832B0D82fcd7aD92) | [Correspondência exata na criação e execução](https://sourcify.dev/server/repo-ui/11155420/0xEB8642297c98206502e8fc05f659e5a2b12b051c) |
| Código-fonte exibido no Blockscout | Sim, `is_verified: true`, importado em `2026-10-05T13:54:48Z` | Sim, `is_verified: true`, importado em `2026-10-05T13:55:22Z` |
| Link do explorador | [Endereço do token](https://optimism-sepolia.blockscout.com/address/0x0202d5f1D5427BcA9d3aD546832B0D82fcd7aD92) | [Endereço do registro](https://optimism-sepolia.blockscout.com/address/0xEB8642297c98206502e8fc05f659e5a2b12b051c) |

Leituras públicas adicionais: `MockUSD.owner()` devolve a carteira emissora acima; `name()` é `MockUSD Test Token`, `symbol()` é `MUSD` e `decimals()` é `6`. `PaymentRegistry.token()` devolve exatamente o endereço do `MockUSD` implantado. A API pública do Sourcify retornou `exact_match` para `creationMatch` e `runtimeMatch` em ambos os contratos.

## Jornada L1 → L2 → liquidação

### Tentativa L1 revertida

A transação [`0x29672b1897c713140d933642da1be8fe066526161a29d5f41995684eed53c0ac`](https://sepolia.etherscan.io/tx/0x29672b1897c713140d933642da1be8fe066526161a29d5f41995684eed53c0ac) chamou `depositETHTo` no Standard Bridge da Ethereum Sepolia com `0,0001 ETH` de teste. O recibo público do bloco `11849774` tem `status: 0`, nenhum evento, limite de gas `626821` e gas usado `584904`. A tarifa consumiu `0,001444318600892832 SepoliaETH`; os `0,0001 ETH` do depósito não foram transferidos à L2.

O `debug_traceTransaction` do RPC público `rpc.sepolia.ethpandaops.io` aponta `out of gas` na chamada interna ao portal. Um `eth_call` histórico da mesma chamada com limite de `2000000` gas retornou sucesso, enquanto uma estimativa de leitura posterior indicou `659794` gas. O frontend passou a estimar novamente e enviar com margem de 30%, respeitando um piso de `850000` gas. Os testes locais dessa alteração passaram. A tentativa pública posterior teve sucesso com limite de `662775` gas e uso de `599544`; como o limite observado ficou abaixo do piso do código, esse recibo **não comprova que a margem do frontend foi aplicada pela carteira**.

### Depósito L1 → L2 confirmado

A [transação L1](https://sepolia.etherscan.io/tx/0x21de2edb71dc4bc35a7d512f1f84c9bbfbeddc03a36e9baa98c2a9e02d721427) chamou `depositETHTo` no Standard Bridge para creditar a própria carteira pagadora. Seu recibo tem `status: 1`, valor `0,0001 ETH` e evento `TransactionDeposited`. A [transação derivada L2](https://sepolia-optimism.etherscan.io/tx/0x71e4f147ed1d0da1100109254a2751c78f614fc3df8cde2a064008aec46f5462) tem tipo de depósito `0x7e`, `status: 1`, `mint` e `value` de `0,0001 ETH`, e eventos da ponte na OP Sepolia.

O evento `TransactionDeposited` foi emitido no bloco L1 `0xfdc33858c20e96fa3d245918aaa452a6010e371f16c863d59501a5c2f1c4f726`, índice global de log `0x2f`. O cálculo do [`sourceHash` especificado pelo OP Stack](https://specs.optimism.io/protocol/deposits.html#source-hash-computation) resultou em `0x1571b07fb605725f4fa37bb9d2c542c8f20b83ec1bf7f68e1bf2020bc1f219ef`, exatamente o `sourceHash` retornado para a transação L2. O backend local registrou o cenário `7f41d94d-f5e1-4601-996c-970117f4773e` como `l2-credited`.

| Etapa | Hash | Bloco e status do recibo | Evidência adicional | Link do explorador |
| --- | --- | --- | --- | --- |
| Depósito iniciado na Ethereum Sepolia | `0x21de2edb71dc4bc35a7d512f1f84c9bbfbeddc03a36e9baa98c2a9e02d721427` | `11849996`, status `1` | `0,0001 ETH` de teste, `TransactionDeposited` | [Etherscan Sepolia](https://sepolia.etherscan.io/tx/0x21de2edb71dc4bc35a7d512f1f84c9bbfbeddc03a36e9baa98c2a9e02d721427) |
| Crédito do depósito na OP Sepolia | `0x71e4f147ed1d0da1100109254a2751c78f614fc3df8cde2a064008aec46f5462` | `49707865`, status `1` | `sourceHash` correspondente ao evento L1, `mint` de `0,0001 ETH` | [Etherscan OP Sepolia](https://sepolia-optimism.etherscan.io/tx/0x71e4f147ed1d0da1100109254a2751c78f614fc3df8cde2a064008aec46f5462) |
| Mint demonstrativo de `MockUSD` | `0x3229002993252d68e0757ab9623180c279cce69d1eebaa139c7d83e3086c3804` | `49708788`, status `1` | Evento `Transfer` da carteira zero para o pagador por `19800000` unidades atômicas; `balanceOf` do pagador retornou `19800000` (`19,8 MockUSD`) | [Etherscan OP Sepolia](https://sepolia-optimism.etherscan.io/tx/0x3229002993252d68e0757ab9623180c279cce69d1eebaa139c7d83e3086c3804) |
| `PaymentCreated` | Pendente | Pendente | `paymentId`, pagador, beneficiário, valor e `termsHash` | Pendente |
| `PaymentApproved` | Pendente | Pendente | `paymentId` e pagador | Pendente |
| `MockUSD.approve` | Pendente | Pendente | Spender `PaymentRegistry` e allowance exata | Pendente |
| `PaymentSettled` | Pendente | Pendente | Evento, estado do registro e saldo do beneficiário | Pendente |

## Revisão final

- [x] Endereços e hashes correspondem ao código dos contratos indicado.
- [x] Recibos de deploy têm status de sucesso na OP Sepolia (`11155420`).
- [x] Bytecode, vínculo do registro com o token, correspondência exata no Sourcify e fontes importados no Blockscout conferidos publicamente.
- [x] Crédito L2 está vinculado ao depósito L1 pelo `sourceHash` do evento `TransactionDeposited`.
- [x] Mint de `19,8 MockUSD` para a carteira pagadora confirmado por recibo, evento e saldo do token.
- [ ] Eventos e estado de `PaymentRegistry` correspondem ao cenário fictício.
- [ ] O saldo de `MockUSD` do beneficiário reflete a liquidação.
- [x] O README separa fatos verificados, pendências e etapas bancárias simuladas.
