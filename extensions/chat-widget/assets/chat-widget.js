(function () {
  const config = window.AI_CHAT_CONFIG || {};
  const backendUrl = config.backendUrl || "http://localhost:3001";
  const shopDomain = config.shopDomain;

  const toggle = document.getElementById("ai-chat-toggle");
  const panel = document.getElementById("ai-chat-panel");
  const closeBtn = document.getElementById("ai-chat-close");
  const input = document.getElementById("ai-chat-input");
  const sendBtn = document.getElementById("ai-chat-send");
  const messages = document.getElementById("ai-chat-messages");

  // Historial de la conversación en memoria
  const history = [];

  toggle.addEventListener("click", () => panel.classList.remove("closed"));
  closeBtn.addEventListener("click", () => panel.classList.add("closed"));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  sendBtn.addEventListener("click", sendMessage);

  function addMessage(text, type) {
    const div = document.createElement("div");
    div.className = type;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addProductCards(products) {
    products.slice(0, 3).forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <a href="${p.product_url}" target="_blank">${p.title}</a>
        <div class="price">$${parseFloat(p.price).toFixed(2)}</div>
      `;
      messages.appendChild(card);
    });
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addMessage(text, "user-message");

    const typing = addMessage("Escribiendo...", "ai-typing");

    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, shopDomain, history }),
      });

      const data = await response.json();
      typing.remove();

      addMessage(data.answer, "ai-message");

      // Agregar al historial para el próximo mensaje
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: data.answer });

      // Limitar historial a últimos 10 mensajes para no inflar el contexto
      if (history.length > 10) history.splice(0, 2);

      if (data.products?.length) {
        addProductCards(data.products);
      }
    } catch (err) {
      typing.remove();
      addMessage("Hubo un error, intentá de nuevo.", "ai-message");
    }
  }
})();
