(() => {
  const input = document.getElementById("atlas-search-input");
  const results = document.getElementById("atlas-search-results");
  const source = document.getElementById("atlas-search-index");
  if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement) || !source) return;

  let entries = [];
  try {
    const parsed = JSON.parse(source.textContent || "[]");
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    return;
  }

  const searchable = entries.map((entry) => ({
    entry,
    text: [entry.title, entry.purpose, entry.breadcrumb, ...(entry.aliases || []), ...(entry.sources || [])]
      .join(" ")
      .toLocaleLowerCase(),
  }));

  const render = () => {
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) return;
    for (const { entry } of searchable.filter((item) => item.text.includes(query)).slice(0, 8)) {
      const anchor = document.createElement("a");
      anchor.href = entry.href;
      anchor.className = "atlas-search-result";
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const breadcrumb = document.createElement("span");
      breadcrumb.textContent = entry.breadcrumb;
      const purpose = document.createElement("small");
      purpose.textContent = entry.purpose;
      anchor.append(title, breadcrumb, purpose);
      results.append(anchor);
    }
    if (!results.childElementCount) {
      const empty = document.createElement("span");
      empty.className = "atlas-search-empty";
      empty.textContent = "No matching page";
      results.append(empty);
    }
  };

  input.addEventListener("input", render);
})();
