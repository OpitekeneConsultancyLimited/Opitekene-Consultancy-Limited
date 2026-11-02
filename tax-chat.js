(function (root, factory) {
  const chat = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = chat;
  } else {
    root.taxCompChat = chat;
    chat.initialize();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const stopWords = new Set([
    "about", "after", "also", "and", "are", "can", "does", "for", "from",
    "give", "help", "how", "into", "like", "need", "new", "please", "tell", "that",
    "the", "this", "under", "what", "when", "where", "which", "with", "would",
    "you", "your", "tax", "taxes", "uganda",
  ]);
  const calculatorLabels = {
    individual: "Individual income",
    paye: "PAYE",
    company: "Company income",
    vat: "VAT",
    rental: "Rental income",
    withholding: "Withholding tax",
    presumptive: "Presumptive tax",
    customs: "Imports and exports",
    "capital-allowances": "Wear and tear",
    international: "International tax workbench",
  };
  const isKnownCalculator = (calculator) => (
    Object.prototype.hasOwnProperty.call(calculatorLabels, calculator)
  );

  function getTerms(query) {
    return String(query || "")
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 2 && !stopWords.has(term)) || [];
  }

  function scoreDocument(document, terms) {
    const title = `${document.title || ""} ${document.name || ""}`.toLowerCase();
    const keywords = (document.keywords || []).join(" ").toLowerCase();
    const body = [
      document.summary,
      document.nextStep,
      document.issue,
      document.significance,
      document.citation,
      document.topic,
    ].filter(Boolean).join(" ").toLowerCase();

    return terms.reduce((score, term) => (
      score + (title.includes(term) ? 4 : 0) +
        (keywords.includes(term) ? 2 : 0) +
        (`${title} ${keywords} ${body}`.includes(term) ? 1 : 0)
    ), 0);
  }

  function findLocalAnswer(query, advisory) {
    const terms = getTerms(query);
    const isGreeting = /^(?:hi|hello|hey|good morning|good afternoon|good evening|greetings)[.!?,\s]*$/i
      .test(String(query || "").trim());
    if (isGreeting || terms.length === 0) {
      return {
        answer: "Hi! I can help find reviewed TaxComp notes about Uganda taxes, cross-border tax topics, and published tax cases. What would you like to know?",
        sources: [],
        matches: [],
        calculators: [],
      };
    }

    const guidance = advisory.guidance
      .map((item) => ({ item, type: "guidance", score: scoreDocument(item, terms) }))
      .filter((entry) => entry.score > 0);
    const cases = advisory.taxCases
      .map((item) => ({ item, type: "case", score: scoreDocument(item, terms) }))
      .filter((entry) => entry.score > 0);
    const matches = [...guidance, ...cases]
      .sort((a, b) => b.score - a.score)
      .filter((entry) => entry.score >= 2)
      .slice(0, 3);

    if (matches.length === 0) {
      return {
        answer: "I couldn't find a reviewed TaxComp note that answers that question. Try asking about a specific tax topic, search the Tax Appeals Tribunal case notes, or contact Opitekene Consultancy Limited at opitekenecons@gmail.com. Please don't send TINs or confidential documents in chat.",
        sources: [],
        matches: [],
        calculators: [],
      };
    }

    const sourceMap = new Map();
    const parts = matches.map(({ item, type }) => {
      if (type === "case") {
        sourceMap.set(item.sourceUrl, {
          label: `${item.name} (${item.citation})`,
          url: item.sourceUrl,
        });
        return `${item.name} (${item.citation}): ${item.summary} ${item.significance}`;
      }

      for (const source of advisory.getSources(item.sourceKeys)) {
        sourceMap.set(source.url, source);
      }
      return `${item.title}: ${item.summary} What to check: ${item.nextStep}`;
    });

    return {
      answer: `I found these reviewed TaxComp notes. They are general information, not a decision on your specific tax position:\n\n${parts.join("\n\n")}`,
      sources: [...sourceMap.values()],
      matches: matches.map(({ item }) => item),
      calculators: [...new Set(matches
        .map(({ item, type }) => type === "guidance" ? item.calculator : null)
        .filter(isKnownCalculator))],
    };
  }

  function allowedSource(source) {
    if (!source || typeof source.label !== "string" || typeof source.url !== "string") {
      return null;
    }
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || !url.hostname ||
          url.username || url.password || source.url.length > 2048) return null;
      return { label: source.label.slice(0, 180), url: url.href };
    } catch {
      return null;
    }
  }

  function initialize() {
    const form = document.querySelector("#tax-chat-form");
    if (!form) return;

    const endpoint = document.querySelector('meta[name="taxcomp-chat-endpoint"]')?.content.trim() || "";
    const messages = document.querySelector("#tax-chat-messages");
    const input = document.querySelector("#tax-chat-input");
    const submit = document.querySelector("#tax-chat-submit");
    const status = document.querySelector("#tax-chat-status");
    const clearButton = document.querySelector("#tax-chat-clear");
    const shortcuts = document.querySelector(".tax-chat-shortcuts");
    const conversation = [];
    let busy = false;

    status.textContent = endpoint
      ? "AI chat is connected. Replies use reviewed TaxComp notes; avoid sharing confidential information."
      : "AI setup is pending. You can chat with the reviewed TaxComp notes while the secure Gemini connection is being set up.";

    function renderMessage(role, text, sources = [], calculators = []) {
      const article = document.createElement("article");
      article.className = `tax-chat-message tax-chat-message-${role}`;
      article.setAttribute("aria-label", role === "assistant" ? "TaxComp assistant" : "Your message");

      const author = document.createElement("strong");
      author.className = "tax-chat-author";
      author.textContent = role === "assistant" ? "TaxComp" : "You";
      article.append(author);

      for (const paragraphText of String(text).split(/\n{2,}/).filter(Boolean)) {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        article.append(paragraph);
      }

      const validSources = sources.map(allowedSource).filter(Boolean);
      if (validSources.length > 0) {
        const list = document.createElement("ul");
        list.className = "tax-chat-sources";
        list.setAttribute("aria-label", "Answer sources");
        for (const source of validSources) {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = source.label;
          item.append(link);
          list.append(item);
        }
        article.append(list);
      }

      const validCalculators = [...new Set(calculators)]
        .filter(isKnownCalculator);
      if (role === "assistant" && validCalculators.length > 0) {
        const actions = document.createElement("div");
        actions.className = "tax-chat-calculator-actions";
        for (const calculator of validCalculators) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.chatCalculator = calculator;
          button.textContent = `Open ${calculatorLabels[calculator]} calculator`;
          actions.append(button);
        }
        article.append(actions);
      }

      messages.append(article);
      messages.scrollTop = messages.scrollHeight;
    }

    function addWelcome() {
      renderMessage(
        "assistant",
        endpoint
          ? "Hello! Ask me about Uganda tax or related international-tax topics. I use reviewed TaxComp notes and search the web for current sources when needed; check the cited sources before relying on an answer."
          : "Hello! Ask me about Uganda tax or related international-tax topics. This chat currently uses TaxComp's reviewed local notes only; live web search is not connected yet.",
      );
    }

    async function getAnswer(question) {
      if (!endpoint) {
        return findLocalAnswer(question, root.ugandaTaxAdvisory);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: question,
            history: conversation.slice(-8),
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(typeof data.error === "string"
            ? data.error
            : "The chat service could not answer right now.");
        }
        if (typeof data.answer !== "string" || !data.answer.trim()) {
          throw new Error("The chat service returned no answer.");
        }
        return {
          answer: data.answer.trim(),
          sources: Array.isArray(data.sources) ? data.sources : [],
          calculators: Array.isArray(data.calculators) ? data.calculators : [],
          webGrounded: data.webGrounded === true,
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const question = input.value.trim();
      if (!question) {
        input.focus();
        return;
      }
      if (question.length > 1600) {
        status.textContent = "Please keep each question to 1,600 characters or fewer.";
        return;
      }

      input.value = "";
      renderMessage("user", question);
      busy = true;
      input.disabled = true;
      submit.disabled = true;
      status.textContent = endpoint
        ? "Checking TaxComp notes and searching current web sources…"
        : "Searching local TaxComp notes. Live web search is not connected yet.";

      try {
        const result = await getAnswer(question);
        renderMessage("assistant", result.answer, result.sources, result.calculators);
        conversation.push(
          { role: "user", text: question },
          { role: "model", text: result.answer },
        );
        if (endpoint) {
          status.textContent = result.webGrounded
            ? "AI reply includes Google Search sources. Verify important tax positions against the cited primary source and effective date."
            : "No web sources were returned for this answer. Treat it as unverified and check current official guidance.";
        } else {
          status.textContent = "Live web search is not connected; this reply came only from reviewed local notes and may not reflect current law.";
        }
      } catch (error) {
        const fallback = findLocalAnswer(question, root.ugandaTaxAdvisory);
        const serviceMessage = error.name === "AbortError"
          ? "The AI request timed out."
          : error.message;
        renderMessage(
          "assistant",
          `Web-enabled AI is unavailable, so I cannot verify current information. ${serviceMessage}\n\n${fallback.answer}`,
          fallback.sources,
          fallback.calculators,
        );
        status.textContent = "The AI service did not answer. This fallback uses only reviewed local notes, not a live web search.";
      } finally {
        busy = false;
        input.disabled = false;
        submit.disabled = false;
        input.focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    shortcuts.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-question]");
      if (!button) return;
      input.value = button.dataset.chatQuestion;
      input.focus();
    });

    messages.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-calculator]");
      if (!button || !isKnownCalculator(button.dataset.chatCalculator)) return;
      if (button.dataset.chatCalculator === "international") {
        document.querySelector("#international-tax").scrollIntoView({ behavior: "smooth" });
        document.querySelector("#international-tax-method").focus({ preventScroll: true });
        return;
      }
      const tab = document.querySelector(
        `.tax-tab[data-tax-head="${button.dataset.chatCalculator}"]`,
      );
      if (!tab) return;
      tab.click();
      document.querySelector("#estimator").scrollIntoView({ behavior: "smooth" });
      document.querySelector("#tax-form").focus({ preventScroll: true });
    });

    clearButton.addEventListener("click", () => {
      if (busy) return;
      messages.replaceChildren();
      conversation.length = 0;
      status.textContent = endpoint
        ? "Chat history cleared from this browser session."
        : "Chat history cleared. Live web search is not connected; answers use local notes only.";
      addWelcome();
      input.focus();
    });

    addWelcome();
  }

  return {
    findLocalAnswer,
    initialize,
  };
});
