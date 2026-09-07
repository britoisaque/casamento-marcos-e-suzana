(() => {
  // Data e horário oficiais do casamento: 28/11/2026, às 17h30 (horário de Brasília).
const weddingDate = new Date("2026-11-28T17:30:00-03:00").getTime();
  const units = [
    ["days", 24 * 60 * 60 * 1000, 3],
    ["hours", 60 * 60 * 1000, 2],
    ["minutes", 60 * 1000, 2],
    ["seconds", 1000, 2]
  ];

  function updateCountdown() {
    const remaining = Math.max(0, weddingDate - Date.now());
    units.forEach(([id, milliseconds, digits]) => {
      const element = document.getElementById(id);
      if (!element) return;
      const value = id === "days"
        ? Math.floor(remaining / milliseconds)
        : Math.floor(remaining / milliseconds) % (id === "hours" ? 24 : 60);
      element.textContent = String(value).padStart(digits, "0");
    });
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
