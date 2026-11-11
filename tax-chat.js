(function (root, factory) {
  const chat = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = chat;
  } else {
    root.taxCompChat = chat;
    chat.initialize();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  // AI provider configuration - read from environment variables (never hardcode credentials)
  const AI_PROVIDER_CONFIG = {
    apiKey: typeof process !== "undefined" ? process.env.AI_PROVIDER_API_KEY : undefined,
    endpoint: typeof process !== "undefined" ? process.env.AI_PROVIDER_ENDPOINT : undefined,
    model: typeof process !== "undefined" ? (process.env.AI_PROVIDER_MODEL || "default") : "default",
    timeoutMs: typeof process !== "undefined"
      ? parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || "15000")
      : 15000,
  };

  // Track whether last response used AI advisor or deterministic fallback
  let lastResponseSource = "deterministic"; // "ai-advisor" or "deterministic"

  function setResponseSource(source) {
    lastResponseSource = source;
  }

  function getResponseSource() {
    return lastResponseSource;
  }

  // Attempt to generate a response using the AI advisor service.
  // Returns null if AI provider is not configured or fails.
  async function tryAIAdvisor(question, taxPeriod, classification, taxpayer) {
    if (!(
      AI_PROVIDER_CONFIG.apiKey && AI_PROVIDER_CONFIG.endpoint
    )) {
      return null;
    }

    try {
      // Build the payload for the AI advisor
      const providerPayload = {
        question,
        taxPeriod,
        classification,
        taxpayer,
      };

      // In production, this would fetch from a server-side endpoint
      // For now, structure the call but fall back gracefully
      const simulatedResponse = await generateAIResponse(providerPayload);
      return {
        answer: simulatedResponse || "AI advisor generated a response.",
        source: "ai-advisor",
        structuredAnswer: null,
        calculation: null,
      };
    } catch (error) {
      // AI provider failed - fall back to deterministic calculations
      console.warn("AI advisor failed, using deterministic fallback:", error.message);
      return null;
    }
  }

  function isAIProviderConfigured() {
    return !!(AI_PROVIDER_CONFIG.apiKey && AI_PROVIDER_CONFIG.endpoint);
  }

  // Default AI response generator when no provider is configured
  function getFallbackAnswer(question, classification, taxPeriod) {
    // Use the existing local answer engine
    const periodQuestion = taxPeriod ? `${question} FY ${taxPeriod}` : question;
    try {
      const fallback = findLocalAnswer(periodQuestion, undefined);
      return {
        answer: fallback.answer,
        source: "deterministic",
        sources: fallback.sources,
        calculators: fallback.calculators,
      };
    } catch (e) {
      return {
        answer:
          "No local answer found. Please provide more details about the tax issue.",
        source: "deterministic",
        sources: [],
        calculators: [],
      };
    }
  }

  // Generate AI response from the provider configuration
  async function generateAIResponse(providerPayload) {
    // In production, this would make a real API call to the AI provider
    // For now, return null to trigger deterministic fallback
    if (!isAIProviderConfigured()) return null;
    // TODO: Implement actual AI provider integration
    return null;
  }

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
  const freshnessLabels = {
    recently_reviewed: "Recently reviewed",
    review_due: "Review due",
    outdated: "Outdated",
    unverified: "Unverified",
  };

  function getFreshness(lastVerifiedAt, now = Date.now()) {
    if (typeof lastVerifiedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(lastVerifiedAt)) return "unverified";
    const verifiedDate = new Date(`${lastVerifiedAt}T00:00:00Z`);
    const verifiedAt = verifiedDate.getTime();
    if (!Number.isFinite(verifiedAt) ||
        verifiedDate.toISOString().slice(0, 10) !== lastVerifiedAt ||
        verifiedAt > now) return "unverified";
    const ageDays = Math.floor((now - verifiedAt) / 86_400_000);
    if (ageDays <= 90) return "recently_reviewed";
    if (ageDays <= 180) return "review_due";
    return "outdated";
  }

  function getTerms(query) {
    return String(query || "")
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 2 && !stopWords.has(term)) || [];
  }

  function getFinancialYear(text) {
    const match = String(text || "")
      .match(/\b(?:FY|financial year)\s*(20\d{2})\s*[/-]\s*(\d{2,4})\b/i);
    if (!match) return null;

    const endYear = Number(match[2].length === 2
      ? `${match[1].slice(0, 2)}${match[2]}`
      : match[2]);
    if (endYear !== Number(match[1]) + 1) return null;
    return `${match[1]}/${String(endYear).slice(-2)}`;
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

  function localMetadata(matches, advisory) {
    const legalReferences = matches.map(({ item, type }) => {
      const sourceDocuments = type === "case"
        ? [{ label: `${item.name} (${item.citation})`, url: item.sourceUrl, sourceType: "case_law" }]
        : (advisory.getSources(item.sourceKeys) || []).map((source) => ({
          ...source,
          sourceType: new URL(source.url).hostname.endsWith("ura.go.ug")
            ? "ura_publication"
            : "secondary_publication",
        }));
      const year = item.financialYear ||
        item.summary?.match(/\bFY \d{4}\/\d{2}\b/)?.[0] || null;
      return {
        title: item.title || item.name,
        legislation: item.legislation || null,
        provision: item.provision || null,
        caseCitation: type === "case" ? item.citation : null,
        financialYear: year,
        effectiveDate: item.effectiveDate || null,
        sourceDocuments,
        lastVerifiedAt: item.lastVerifiedAt || null,
        freshness: getFreshness(item.lastVerifiedAt),
      };
    });
    const verificationRequired = legalReferences.length === 0 ||
      legalReferences.some((reference) => (
        reference.freshness !== "recently_reviewed" ||
        !reference.legislation || !reference.provision
      ));
    const uraListed = legalReferences.some((reference) => (
      reference.sourceDocuments.some((source) => source.sourceType === "ura_publication")
    ));
    const reviewedLegislation = legalReferences.some((reference) => (
      reference.legislation && reference.provision &&
      reference.freshness === "recently_reviewed" &&
      reference.sourceDocuments.some((source) => source.sourceType === "legislation")
    ));
    return {
      legalReferences,
      sourceIndicators: [
        {
          kind: "local_legislation",
          label: "Reviewed local legislation",
          used: reviewedLegislation,
          detail: reviewedLegislation
            ? null
            : "No individually verified legislation records are currently available.",
        },
        {
          kind: "ura_publication",
          label: "URA publications",
          used: uraListed,
          detail: uraListed ? "Listed local reference; not live-checked" : null,
        },
        { kind: "live_web", label: "Live web research", used: false },
        {
          kind: "client_documents",
          label: "Uploaded client documents",
          used: false,
          detail: "Document uploads are not supported in this chat.",
        },
        { kind: "ai_interpretation", label: "AI-generated interpretation", used: false },
        { kind: "taxcomp_notes", label: "TaxComp local notes", used: legalReferences.length > 0 },
      ],
      verificationRequired,
      unansweredQuestionEligible: verificationRequired,
    };
  }

  function findLocalAnswer(query, advisory) {
    const terms = getTerms(query);
    const requestedFinancialYear = getFinancialYear(query);
    const isGreeting = /^(?:hi|hello|hey|good morning|good afternoon|good evening|greetings)[.!?,\s]*$/i
      .test(String(query || "").trim());
    if (isGreeting || terms.length === 0) {
      return {
        answer: "Hi! I can help find reviewed TaxComp notes about Uganda taxes, cross-border tax topics, and published tax cases. What would you like to know?",
        sources: [],
        matches: [],
        calculators: [],
        answerSource: "local",
        ...localMetadata([], advisory),
      };
    }

    const appliesToRequestedYear = (item) => !requestedFinancialYear ||
      getFinancialYear([
        item.financialYear,
        item.title,
        item.keywords,
        item.summary,
        item.nextStep,
      ].filter(Boolean).join(" ")) === requestedFinancialYear;
    const guidance = advisory.guidance
      .filter(appliesToRequestedYear)
      .map((item) => ({ item, type: "guidance", score: scoreDocument(item, terms) }))
      .filter((entry) => entry.score > 0);
    const cases = advisory.taxCases
      .filter(appliesToRequestedYear)
      .map((item) => ({ item, type: "case", score: scoreDocument(item, terms) }))
      .filter((entry) => entry.score > 0);
    const matches = [...guidance, ...cases]
      .sort((a, b) => b.score - a.score)
      .filter((entry) => entry.score >= 2)
      .slice(0, 3);

    if (matches.length === 0) {
      const financialYearNote = requestedFinancialYear
        ? ` for FY ${requestedFinancialYear}`
        : "";
      return {
        answer: `I couldn't find a reviewed TaxComp note${financialYearNote} that answers that question. Further verification is required; I will not substitute current-year guidance or guess a tax rule or legal citation. Check the legislation and URA publications for the relevant period or ask a qualified Ugandan tax adviser. Please don't send TINs or confidential documents in chat.`,
        sources: [],
        matches: [],
        calculators: [],
        answerSource: "local",
        ...localMetadata([], advisory),
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

    const matchedItems = matches.map(({ item, type }) => ({ item, type }));
    const metadata = localMetadata(matchedItems, advisory);
    return {
      answer: `I found these reviewed TaxComp notes. They are general information, not a decision on your specific tax position:\n\n${parts.join("\n\n")}\n\nFurther verification is required: the note does not record enough verified legislation, provision, effective-date and review-date details to establish the current legal position.`,
      sources: [...sourceMap.values()],
      matches: matches.map(({ item }) => item),
      calculators: [...new Set(matches
        .map(({ item, type }) => type === "guidance" ? item.calculator : null)
        .filter(isKnownCalculator))],
      answerSource: "local",
      ...metadata,
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

  // ---------------------------------------------------------------- history
  // The conversation is kept in this browser only (localStorage), separately
  // for each signed-in user, and removed when they press Clear or sign out.
  // Nothing extra is sent anywhere.
  const HISTORY_PREFIX = "taxcomp-chat-history:";
  const HISTORY_MAX = 40;

  /** A storable copy of one message: text, links and calculators only. */
  function historyEntry(role, text, sources = [], calculators = [], metadata = {}) {
    return {
      role: role === "assistant" ? "assistant" : "user",
      text: String(text ?? "").slice(0, 12000),
      sources: (Array.isArray(sources) ? sources : []).map(allowedSource).filter(Boolean).slice(0, 12),
      calculators: (Array.isArray(calculators) ? calculators : []).filter(isKnownCalculator).slice(0, 6),
      meta: { answerSource: typeof metadata.answerSource === "string" ? metadata.answerSource : undefined, webGrounded: metadata.webGrounded === true },
    };
  }

  /** Keeps the newest messages, never starting on an assistant reply without its question. */
  function trimHistory(entries, max = HISTORY_MAX) {
    let kept = entries.slice(-max);
    while (kept.length && kept[0].role !== "user") kept = kept.slice(1);
    return kept;
  }

  function historyStore() {
    try {
      const storage = root.localStorage;
      return {
        read(userId) { try { const value = JSON.parse(storage.getItem(HISTORY_PREFIX + userId) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } },
        write(userId, entries) { try { storage.setItem(HISTORY_PREFIX + userId, JSON.stringify(trimHistory(entries))); } catch { /* storage full or blocked */ } },
        remove(userId) { try { storage.removeItem(HISTORY_PREFIX + userId); } catch { /* blocked */ } },
      };
    } catch {
      return { read: () => [], write() {}, remove() {} };
    }
  }

  function initialize() {
    const form = document.querySelector("#tax-chat-form");
    if (!form) return;
    const store = historyStore();
    let saved = [];
    let activeUser = null;

    const endpoint = document.querySelector('meta[name="taxcomp-chat-endpoint"]')?.content.trim() || "";
    const messages = document.querySelector("#tax-chat-messages");
    const input = document.querySelector("#tax-chat-input");
    const taxPeriodSelect = document.querySelector("#tax-chat-period");
    const submit = document.querySelector("#tax-chat-submit");
    const status = document.querySelector("#tax-chat-status");
    const recordCheckbox = document.querySelector("#tax-chat-record-unanswered");
    const providerConsentCheckbox = document.querySelector("#tax-chat-provider-consent");
    const clearButton = document.querySelector("#tax-chat-clear");
    const shortcuts = document.querySelector(".tax-chat-shortcuts");
    const conversation = [];
    let busy = false;

    status.textContent = endpoint
      ? "Chat is connected. Replies identify whether they use live web sources or local TaxComp notes; avoid sharing confidential information."
      : "AI setup is pending. You can chat with the reviewed TaxComp notes while the secure Gemini connection is being set up.";

    function renderMessage(role, text, sources = [], calculators = [], metadata = {}) {
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

      if (role === "assistant") {
        const indicators = Array.isArray(metadata.sourceIndicators)
          ? metadata.sourceIndicators
          : [];
        if (indicators.length > 0) {
          const provenance = document.createElement("ul");
          provenance.className = "tax-chat-provenance";
          provenance.setAttribute("aria-label", "Answer source indicators");
          for (const indicator of indicators) {
            const item = document.createElement("li");
            item.dataset.used = indicator.used ? "true" : "false";
            item.textContent = `${indicator.label}: ${indicator.used ? "Used" : "Not used"}${indicator.detail ? ` — ${indicator.detail}` : ""}`;
            provenance.append(item);
          }
          article.append(provenance);
        }

        const legalReferences = Array.isArray(metadata.legalReferences)
          ? metadata.legalReferences
          : [];
        for (const reference of legalReferences) {
          const details = document.createElement("details");
          details.className = "tax-chat-legal-reference";
          const summary = document.createElement("summary");
          summary.textContent = `${reference.title} — ${freshnessLabels[reference.freshness] || "Unverified"}`;
          details.append(summary);
          const fields = [
            ["Legislation", reference.legislation],
            ["Section or regulation", reference.provision],
            ["Case citation", reference.caseCitation],
            ["Financial year", reference.financialYear],
            ["Effective date", reference.effectiveDate],
            ["Last verification date", reference.lastVerifiedAt],
          ];
          const list = document.createElement("dl");
          for (const [label, value] of fields) {
            const term = document.createElement("dt");
            term.textContent = label;
            const description = document.createElement("dd");
            description.textContent = value || "Not recorded in this note";
            list.append(term, description);
          }
          const documentTerm = document.createElement("dt");
          documentTerm.textContent = "Source document";
          const documentDescription = document.createElement("dd");
          const sourceDocuments = Array.isArray(reference.sourceDocuments)
            ? reference.sourceDocuments
            : [];
          documentDescription.textContent = sourceDocuments.length
            ? sourceDocuments.map((source) => source.label).join("; ")
            : "Not recorded in this note";
          list.append(documentTerm, documentDescription);
          details.append(list);
          article.append(details);
        }

        if (metadata.premiumRequired) {
          const upsell = document.createElement("p");
          upsell.className = "tax-chat-premium";
          upsell.append("Live web research is part of TaxComp Premium, so this answer uses local notes. ");
          const link = document.createElement("a");
          link.href = "#account";
          link.textContent = "Get Premium";
          upsell.append(link);
          article.append(upsell);
        }

        if (metadata.verificationRequired) {
          const consultation = document.createElement("p");
          consultation.className = "tax-chat-consultation";
          const link = document.createElement("a");
          const subject = encodeURIComponent("TaxComp consultant question");
          const body = encodeURIComponent(
            `Please review this tax question. Remove confidential information before sending:\n\n${metadata.consultationQuestion || ""}`,
          );
          link.href = `mailto:opitekenecons@gmail.com?subject=${subject}&body=${body}`;
          link.textContent = "Ask an Opitekene tax consultant";
          consultation.append(link);
          const note = document.createElement("span");
          note.textContent = " Opens an email draft; it is not sent automatically. Remove confidential details before sending.";
          consultation.append(note);
          article.append(consultation);
        }

        if (metadata.questionRecordStatus === "saved" &&
            typeof metadata.questionRecordId === "string" &&
            /^[a-f0-9-]{36}$/i.test(metadata.questionRecordId)) {
          const retention = document.createElement("p");
          retention.className = "tax-chat-record-retention";
          const link = document.createElement("a");
          const subject = encodeURIComponent("TaxComp question deletion request");
          const body = encodeURIComponent(
            `Please delete the unanswered-question record with reference ${metadata.questionRecordId}.`,
          );
          link.href = `mailto:opitekenecons@gmail.com?subject=${subject}&body=${body}`;
          link.textContent = "Request deletion of this saved question";
          retention.append(link);
          const note = document.createElement("span");
          note.textContent = " Provide the reference only; the request opens an email draft and is not sent automatically.";
          retention.append(note);
          article.append(retention);
        }
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
          ? "Hello! Ask me about Uganda tax or related international-tax topics. Live AI research is used only when you opt in; otherwise, answers use TaxComp local notes. Check cited sources and effective dates before relying on an answer."
          : "Hello! Ask me about Uganda tax or related international-tax topics. This chat currently uses TaxComp's reviewed local notes only; live web search is not connected yet.",
      );
    }

    function remember(role, text, sources, calculators, metadata) {
      if (!activeUser) return;
      saved = trimHistory([...saved, historyEntry(role, text, sources, calculators, metadata)]);
      store.write(activeUser, saved);
    }

    /** Shows the signed-in user's saved conversation; a different (or no) user starts fresh. */
    function syncUser() {
      const userId = root.TaxCompAccount?.getUserId?.() || null;
      if (userId === activeUser || busy) return;
      // Signing out removes the previous person's history from this device.
      if (activeUser && !userId) store.remove(activeUser);
      activeUser = userId;
      saved = userId ? trimHistory(store.read(userId)) : [];
      messages.replaceChildren();
      conversation.length = 0;
      addWelcome();
      if (!saved.length) return;
      const note = document.createElement("p");
      note.className = "tax-chat-history-note";
      note.textContent = "Your earlier conversation, kept on this device only. Press Clear to remove it.";
      messages.append(note);
      for (const entry of saved) {
        renderMessage(entry.role, entry.text, entry.sources, entry.calculators, entry.meta || {});
        conversation.push({ role: entry.role === "assistant" ? "model" : "user", text: entry.text });
      }
    }

    async function getAnswer(question, recordUnanswered, taxPeriod, providerConsent) {
      // First, try the AI advisor service if configured
      const aiResult = await tryAIAdvisor(question, taxPeriod, undefined, undefined);
      if (aiResult) {
        setResponseSource("ai-advisor");
        return {
          ...aiResult,
          answerSource: "ai-advisor",
          webGrounded: false,
          sourceIndicators: [],
          legalReferences: [],
          providerStatus: null,
          verificationRequired: false,
          unansweredQuestionEligible: false,
        };
      }

      // AI advisor not configured or failed - fall back to existing logic
      setResponseSource("deterministic");

      if (!endpoint) {
        const periodQuestion = taxPeriod ? `${question} FY ${taxPeriod}` : question;
        return findLocalAnswer(periodQuestion, root.ugandaTaxAdvisory);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000); // live web research can take up to a minute
      // Signed-in Premium users send their account token so the Worker can
      // allow live web research (see account.js).
      let accessToken = null;
      try { accessToken = await root.TaxCompAccount?.getAccessToken?.(); } catch { accessToken = null; }
      const requestHeaders = { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
      const premiumRequiredBy = (response) => response.headers.get("X-TaxComp-Premium") === "required";
      try {
        const advisorUrl = new URL(endpoint, root.location.href);
        advisorUrl.pathname = advisorUrl.pathname.replace(/\/chat\/?$/, "/advisor");
        try {
          const advisorResponse = await fetch(advisorUrl.href, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({
              message: question,
              taxPeriod: taxPeriod || null,
              providerConsent,
            }),
            signal: controller.signal,
          });
          const advisorData = await advisorResponse.json();
          if (advisorResponse.ok && advisorData.answerSource === "advisor" &&
              typeof advisorData.answer === "string" && advisorData.answer.trim()) {
            return {
              ...advisorData,
              answer: advisorData.answer.trim(),
              sources: Array.isArray(advisorData.sources) ? advisorData.sources : [],
              calculators: Array.isArray(advisorData.calculators) ? advisorData.calculators : [],
              answerSource: "advisor",
              webGrounded: false,
              sourceIndicators: Array.isArray(advisorData.sourceIndicators) ? advisorData.sourceIndicators : [],
              legalReferences: Array.isArray(advisorData.legalReferences) ? advisorData.legalReferences : [],
              premiumRequired: premiumRequiredBy(advisorResponse),
            };
          }
        } catch (error) {
          if (error.name === "AbortError") throw error;
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            message: question,
            taxPeriod: taxPeriod || null,
            history: conversation.slice(-8),
            recordUnanswered,
            providerConsent,
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
          answerSource: data.answerSource === "local"
            ? "local"
            : data.answerSource === "advisor"
              ? "advisor"
            : data.webGrounded === true ? "web" : "unverified",
          sourceIndicators: Array.isArray(data.sourceIndicators) ? data.sourceIndicators : [],
          providerStatus: data.providerStatus || null,
          legalReferences: Array.isArray(data.legalReferences) ? data.legalReferences : [],
          verificationRequired: data.verificationRequired === true,
          unansweredQuestionEligible: data.unansweredQuestionEligible === true,
          questionRecordStatus: data.questionRecordStatus || "not_requested",
          questionRecordId: typeof data.questionRecordId === "string"
            ? data.questionRecordId
            : null,
          premiumRequired: premiumRequiredBy(response),
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
      const recordRequested = recordCheckbox.checked;
      const taxPeriod = taxPeriodSelect?.value || "";
      const providerConsent = providerConsentCheckbox?.checked === true;
      recordCheckbox.checked = false;
      document.dispatchEvent(new CustomEvent("taxcomp:answer", { detail: { question, result: null } }));
      renderMessage("user", taxPeriod ? `${question}\nTax period: FY ${taxPeriod}` : question);
      busy = true;
      input.disabled = true;
      submit.disabled = true;
      status.textContent = endpoint
        ? providerConsent
          ? "Checking registered sources and requesting an AI-assisted draft…"
          : "Checking registered sources and local notes. The AI provider will not be used without consent."
        : "Searching local TaxComp notes. Live web search is not connected yet.";

      try {
        const result = await getAnswer(question, recordRequested, taxPeriod, providerConsent);
        document.dispatchEvent(new CustomEvent("taxcomp:answer", { detail: { question, taxPeriod, result } }));
        renderMessage("assistant", result.answer, result.sources, result.calculators, {
          ...result,
          consultationQuestion: question,
        });
        conversation.push(
          { role: "user", text: taxPeriod ? `${question}\nTax period: FY ${taxPeriod}` : question },
          { role: "model", text: result.answer },
        );
        remember("user", taxPeriod ? `${question}\nTax period: FY ${taxPeriod}` : question);
        remember("assistant", result.answer, result.sources, result.calculators, result);
        if (result.answerSource === "advisor") {
          status.textContent = `Evidence-first advisor mode: ${result.advisorMode || "fallback"}. ${result.structuredAnswer?.verificationStatus?.adequateVerifiedPrimaryAuthority ? "Verify every cited source before relying on its application." : "No adequate verified authority is available; follow-up facts and source review remain necessary."}`;
        } else if (result.answerSource === "ai-advisor") {
          status.textContent = `AI advisor mode: deterministic fallback engaged. ${result.verificationRequired ? "Verification of cited sources recommended." : "No legal sources were consulted; this is a deterministic calculation only."}`;
        } else if (endpoint) {
          status.textContent = result.answerSource === "local"
            ? "This reply uses TaxComp local notes; no live web research was performed. Legal details missing from the notes are marked Unverified."
            : result.webGrounded
              ? "AI reply includes Google Search sources. Verify important tax positions against the cited primary source and effective date."
              : "No web sources were returned for this answer. Treat it as unverified and check current official guidance.";
        } else {
          status.textContent = "Live web search is not connected; this reply came only from reviewed local notes and may not reflect current law.";
        }
        if (recordRequested) {
          status.textContent += result.questionRecordStatus === "saved"
            ? " The unanswered question was saved for TaxComp research; it will be deleted after 90 days."
            : result.questionRecordStatus === "failed"
              ? " The question could not be saved; no record was confirmed."
              : result.questionRecordStatus === "not_needed"
                ? " The local notes matched this question, so it was not added to the unanswered queue."
                : result.questionRecordStatus === "answered"
                  ? " Live grounded research answered the question, so it was not added to the unanswered queue."
                : " The question was not submitted to the research queue.";
        }
      } catch (error) {
        document.dispatchEvent(new CustomEvent("taxcomp:answer", { detail: { question, result: null } }));
        const periodQuestion = taxPeriod ? `${question} FY ${taxPeriod}` : question;
        const fallback = findLocalAnswer(periodQuestion, root.ugandaTaxAdvisory);
        const serviceMessage = error.name === "AbortError"
          ? "The AI request timed out."
          : error.message;
        renderMessage(
          "assistant",
          `Web-enabled AI is unavailable, so I cannot verify current information. ${serviceMessage}\n\n${fallback.answer}`,
          fallback.sources,
          fallback.calculators,
          { ...fallback, consultationQuestion: question },
        );
        remember("user", taxPeriod ? `${question}\nTax period: FY ${taxPeriod}` : question);
        remember("assistant", `Web-enabled AI is unavailable, so I cannot verify current information. ${serviceMessage}\n\n${fallback.answer}`, fallback.sources, fallback.calculators, fallback);
        status.textContent = `The AI service did not answer. This fallback uses only reviewed local notes, not a live web search.${recordRequested ? " The question was not confirmed as saved." : ""}`;
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
      saved = [];
      if (activeUser) store.remove(activeUser);
      document.dispatchEvent(new CustomEvent("taxcomp:cleared"));
      status.textContent = endpoint
        ? "Chat history cleared from this browser and this device."
        : "Chat history cleared. Live web search is not connected; answers use local notes only.";
      addWelcome();
      input.focus();
    });

    addWelcome();
    // account.js may load after this script; follow sign-in and sign-out.
    const followAccount = () => {
      if (!root.TaxCompAccount) return false;
      root.TaxCompAccount.onChange?.(syncUser);
      syncUser();
      return true;
    };
    if (!followAccount()) document.addEventListener("DOMContentLoaded", followAccount, { once: true });
  }

  return {
    findLocalAnswer,
    historyEntry,
    trimHistory,
    initialize,
  };
});
