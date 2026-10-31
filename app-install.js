(function () {
  const installButton = document.querySelector("#install-app");
  const installHelp = document.querySelector("#install-help");
  if (!installButton || !installHelp) return;

  let installPrompt = null;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  installButton.hidden = isStandalone || !isAppleMobile;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.hidden = true;
    installHelp.hidden = true;
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      installHelp.textContent = isAppleMobile
        ? "In Safari, tap Share, then choose Add to Home Screen."
        : "Use your browser menu to choose Install app or Add to Home Screen.";
      installHelp.hidden = false;
      return;
    }

    installButton.disabled = true;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        installButton.hidden = true;
        installHelp.textContent = "TaxComp is being installed on this device.";
        installHelp.hidden = false;
      }
      installPrompt = null;
    } finally {
      installButton.disabled = false;
    }
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js")
        .catch((error) => {
          console.error("TaxComp offline support could not be enabled.", error);
        });
    });
  }
})();
