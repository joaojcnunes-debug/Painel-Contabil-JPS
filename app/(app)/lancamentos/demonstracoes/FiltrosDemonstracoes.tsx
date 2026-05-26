"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type Props = {
  clientes: Array<{ id_cliente: string; razao_social: string }>;
  clienteAtual: string;
  dataInicio: string;
  dataFim: string;
};

export function FiltrosDemonstracoes({
  clientes,
  clienteAtual,
  dataInicio,
  dataFim,
}: Props) {
  const router = useRouter();
  const [cliente, setCliente] = useState(clienteAtual);
  const [de, setDe] = useState(dataInicio);
  const [ate, setAte] = useState(dataFim);

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (cliente) params.set("cliente", cliente);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    router.push(
      `/lancamentos/demonstracoes${params.toString() ? "?" + params.toString() : ""}`
    );
  }

  return (
    <form
      onSubmit={aplicar}
      className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end print:hidden"
    >
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">De</label>
        <input
          type="date"
          className={inputClass}
          value={de}
          onChange={(e) => setDe(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Até</label>
        <input
          type="date"
          className={inputClass}
          value={ate}
          onChange={(e) => setAte(e.target.value)}
        />
      </div>
      <div className="min-w-[220px]">
        <label className="block text-xs uppercase text-gray-500 mb-1">
          Cliente
        </label>
        <select
          className={inputClass}
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
        >
          <option value="">Todos (consolidado)</option>
          {clientes.map((c) => (
            <option key={c.id_cliente} value={c.id_cliente}>
              {c.razao_social}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">Aplicar</Button>
      <button
        type="button"
        onClick={() => window.print()}
        className="px-3 py-2 text-sm text-gray-600 hover:text-verde-dark border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
      >
        <Printer size={14} /> Imprimir
      </button>
    </form>
  );
}
