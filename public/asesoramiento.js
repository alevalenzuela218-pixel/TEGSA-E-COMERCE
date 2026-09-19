document.getElementById("send").addEventListener("click", async () => {
  const nombre = document.getElementById("f-nombre").value.trim();
  const email = document.getElementById("f-email").value.trim();
  const telefono = document.getElementById("f-tel").value.trim();
  const msg = document.getElementById("msg");

  if (!nombre || !(email || telefono)) {
    msg.textContent = "Dejanos tu nombre y un email o teléfono para responderte.";
    msg.style.color = "#c0492f";
    return;
  }
  const btn = document.getElementById("send");
  btn.disabled = true; btn.textContent = "Enviando…";
  try {
    const res = await fetch("/api/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre, email, telefono,
        tipo_proyecto: document.getElementById("f-tipo").value,
        mensaje: document.getElementById("f-msg").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    document.getElementById("form").innerHTML = `
      <div class="ok-box">
        <strong>¡Consulta enviada!</strong>
        <p style="margin:8px 0 0">Gracias, ${nombre.split(" ")[0]}. Un ingeniero te va a contactar a la brevedad con una propuesta.</p>
      </div>
      <p class="an-sub" style="margin-top:14px"><a href="/" style="color:var(--steel)">← Volver al catálogo</a></p>`;
  } catch (e) {
    msg.textContent = e.message || "No se pudo enviar. Probá de nuevo.";
    msg.style.color = "#c0492f";
    btn.disabled = false; btn.textContent = "Enviar consulta";
  }
});
