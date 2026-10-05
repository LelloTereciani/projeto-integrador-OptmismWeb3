"use client";

import { useState, type FormEvent } from "react";

import type { PaymentScenario } from "../../../../packages/shared/src/payment";
import type { InvoiceDraft } from "../features/payment/payment-types";
import {
  createInvoicePayload,
  deserializeScenario,
  type InvoiceFieldError,
} from "../features/payment/ui-model";

interface InvoiceFormProps {
  onCreated(scenario: PaymentScenario): void;
  initialDraft?: InvoiceDraft;
}

const EMPTY_DRAFT: InvoiceDraft = {
  payerAddress: "",
  beneficiaryAddress: "",
  brlAmount: "",
};

function isFieldError(value: ReturnType<typeof createInvoicePayload>): value is InvoiceFieldError {
  return "field" in value;
}

export function InvoiceForm({ onCreated, initialDraft = EMPTY_DRAFT }: InvoiceFormProps) {
  const [draft, setDraft] = useState<InvoiceDraft>(initialDraft);
  const [fieldError, setFieldError] = useState<InvoiceFieldError | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof InvoiceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (fieldError?.field === field) {
      setFieldError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError(null);

    const payload = createInvoicePayload(draft);
    if (isFieldError(payload)) {
      setFieldError(payload);
      const fieldId =
        payload.field === "payerAddress"
          ? "payer-address"
          : payload.field === "beneficiaryAddress"
            ? "beneficiary-address"
            : "brl-amount";
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : "Não foi possível criar o cenário agora.";
        throw new Error(message);
      }
      onCreated(deserializeScenario(body));
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o cenário. Revise os dados e tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="invoice-form" onSubmit={handleSubmit} noValidate>
      <div className="section-heading">
        <span className="eyebrow">01 · Cenário</span>
        <h2 id="invoice-heading">Monte a fatura fictícia</h2>
        <p>
          Use apenas endereços de carteira de teste. Nenhum dado bancário, empresarial ou pessoal é
          necessário.
        </p>
      </div>

      <div className="field-grid">
        <div className="field field-wide">
          <label htmlFor="payer-address">Carteira pagadora de teste</label>
          <input
            id="payer-address"
            name="payerAddress"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={draft.payerAddress}
            onChange={(event) => updateField("payerAddress", event.target.value)}
            aria-invalid={fieldError?.field === "payerAddress"}
            aria-describedby={
              fieldError?.field === "payerAddress" ? "payer-address-error" : "payer-address-hint"
            }
            placeholder="0x…"
          />
          <span className="field-hint" id="payer-address-hint">
            Esta mesma conta assinará as etapas on-chain.
          </span>
          {fieldError?.field === "payerAddress" ? (
            <span className="field-error" id="payer-address-error">
              {fieldError.message}
            </span>
          ) : null}
        </div>

        <div className="field field-wide">
          <label htmlFor="beneficiary-address">Carteira beneficiária de teste</label>
          <input
            id="beneficiary-address"
            name="beneficiaryAddress"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={draft.beneficiaryAddress}
            onChange={(event) => updateField("beneficiaryAddress", event.target.value)}
            aria-invalid={fieldError?.field === "beneficiaryAddress"}
            aria-describedby={
              fieldError?.field === "beneficiaryAddress"
                ? "beneficiary-address-error"
                : "beneficiary-address-hint"
            }
            placeholder="0x…"
          />
          <span className="field-hint" id="beneficiary-address-hint">
            O MockUSD de teste será enviado para este endereço completo.
          </span>
          {fieldError?.field === "beneficiaryAddress" ? (
            <span className="field-error" id="beneficiary-address-error">
              {fieldError.message}
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="brl-amount">Valor fictício em BRL</label>
          <div className="amount-input">
            <span aria-hidden="true">R$</span>
            <input
              id="brl-amount"
              name="brlAmount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.brlAmount}
              onChange={(event) => updateField("brlAmount", event.target.value)}
              aria-invalid={fieldError?.field === "brlAmount"}
              aria-describedby={
                fieldError?.field === "brlAmount" ? "brl-amount-error" : "brl-amount-hint"
              }
              placeholder="100,00"
            />
          </div>
          <span className="field-hint" id="brl-amount-hint">
            O servidor calcula taxa, tarifa e MockUSD com inteiros exatos. Exemplo: R$ 25,26 resultam em 5,000000 MUSD de teste.
          </span>
          {fieldError?.field === "brlAmount" ? (
            <span className="field-error" id="brl-amount-error">
              {fieldError.message}
            </span>
          ) : null}
        </div>
      </div>

      {requestError ? (
        <div className="form-error" role="alert" tabIndex={-1}>
          <strong>O cenário foi preservado.</strong>
          <span>{requestError}</span>
        </div>
      ) : null}

      <button className="button button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Calculando simulação…" : "Gerar cotação simulada"}
      </button>
    </form>
  );
}
