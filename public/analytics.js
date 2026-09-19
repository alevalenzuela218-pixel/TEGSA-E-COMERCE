function rankRows(arr, key, unit) {
  if (!arr.length) return `<div class="an-empty">Aún sin datos.</div>`;
  const max = Math.max(...arr.map((x) => x[key]), 1);
  return arr.map((x, i) => `
    <div class="rrow">
      <span class="pos">${i + 1}</span>
      <span class="nm">${x.nombre} <small>${x.sku}</small>
        <div class="bar"><i style="width:${Math.round((x[key] / max) * 100)}%"></i></div>
      </span>
      <span class="val">${x[key]}${unit ? " " + unit : ""}</span>
    </div>`).join("");
}

async function main() {
  const box = document.getElementById("an");
  const res = await fetch("/api/admin/analytics");
  if (!res.ok) { box.innerHTML = `<p class="an-sub">No se pudo cargar la analítica.</p>`; return; }
  const d = await res.json();
  const t = d.totals || {};

  box.innerHTML = `
    <h1>Analítica de la tienda</h1>
    <p class="an-sub">Qué mira y qué compra la gente. Las visitas se cuentan por vista de ficha; las ventas, por unidades en pedidos.</p>

    <div class="kpis">
      <div class="kpi"><div class="n">${t.total_vistas ?? 0}</div><div class="l">Visitas a fichas</div></div>
      <div class="kpi"><div class="n">${t.total_unidades ?? 0}</div><div class="l">Unidades vendidas</div></div>
      <div class="kpi"><div class="n">${t.total_pedidos ?? 0}</div><div class="l">Pedidos</div></div>
      <div class="kpi"><div class="n">${t.sin_vistas ?? 0}</div><div class="l">Productos sin visitas</div></div>
    </div>

    <div class="rank-grid">
      <div class="rank">
        <h3>Más visitados <span class="tag up">lo que más interesa</span></h3>
        ${rankRows(d.mas_visitados, "vistas", "vistas")}
      </div>
      <div class="rank">
        <h3>Menos visitados <span class="tag down">lo que menos interesa</span></h3>
        ${rankRows(d.menos_visitados, "vistas", "vistas")}
      </div>
      <div class="rank">
        <h3>Más vendidos <span class="tag up">top de ventas</span></h3>
        ${rankRows(d.mas_vendidos, "vendidos", "u.")}
      </div>
      <div class="rank">
        <h3>Menos vendidos <span class="tag down">rotan poco</span></h3>
        ${rankRows(d.menos_vendidos, "vendidos", "u.")}
      </div>
    </div>`;
}
main();
