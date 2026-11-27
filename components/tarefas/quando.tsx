"use client";

import { useState } from "react";

/** "Quando" do anotar rápido: Hoje, Amanhã, Algum dia ou uma data escolhida. */
export function QuandoTarefa({ hoje }: { hoje: string }) {
  const [para, setPara] = useState("hoje");
  return (
    <span className="tl-quando">
      <select name="para" aria-label="Quando" value={para} onChange={(e) => setPara(e.target.value)}>
        <option value="hoje">Hoje</option>
        <option value="amanha">Amanhã</option>
        <option value="data">Escolher data…</option>
        <option value="ideia">Algum dia</option>
      </select>
      {para === "data" && <input type="date" name="data" min={hoje} defaultValue={hoje} aria-label="Data da tarefa" required autoFocus />}
    </span>
  );
}
