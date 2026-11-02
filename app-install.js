(function () {
  const installButtons = document.querySelectorAll("[data-install-app]");
  const installHelp = document.querySelector("#install-help");
  if (!installButtons.length || !installHelp) return;

  let installPrompt = null;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);

  installButtons.forEach((button) => {
    button.hidden = isStandalone;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButtons.forEach((button) => {
      button.hidden = false;
    });
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButtons.forEach((button) => {
      button.hidden = true;
    });
    installHelp.textContent = "TaxComp has been installed on this device.";
    installHelp.hidden = true;
  });

  async function installTaxComp() {
    if (isStandalone) {
      installHelp.textContent = "TaxComp is already installed on this device.";
      installHelp.hidden = false;
      return;
    }

    if (!installPrompt) {
      if (isAppleMobile && !isSafari) {
        installHelp.textContent =
          "Open this TaxComp page in Safari, tap Share, then choose Add to Home Screen.";
      } else if (isAppleMobile) {
        installHelp.textContent =
          "In Safari, tap Share, scroll down, then choose Add to Home Screen.";
      } else if (/Android/i.test(navigator.userAgent)) {
        installHelp.textContent =
          "In Chrome, tap the three-dot menu, then choose Install app or Add to Home screen. If you do not see either option, update Chrome and reopen this page.";
      } else {
        installHelp.textContent =
          "In Chrome or Edge, open the browser menu and choose Install app. TaxComp must be open over HTTPS.";
      }
      installHelp.hidden = false;
      installHelp.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    installButtons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        installHelp.textContent = "TaxComp is being installed on this device.";
        installHelp.hidden = false;
      }
      installPrompt = null;
    } finally {
      installButtons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  installButtons.forEach((button) => {
    button.addEventListener("click", installTaxComp);
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
