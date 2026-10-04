"use client";

import { useMemo, useState } from "react";

type FaqQuestion = {
  readonly question: string;
  readonly answer: string;
};

type FaqSection = {
  readonly id: string;
  readonly label: string;
  readonly questions: readonly FaqQuestion[];
};

export default function FaqExplorer({ sections }: { sections: readonly FaqSection[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const totalQuestions = sections.reduce((total, section) => total + section.questions.length, 0);

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return sections;
    return sections
      .map((section) => ({
        ...section,
        questions: section.questions.filter((item) =>
          `${section.label} ${item.question} ${item.answer}`.toLocaleLowerCase().includes(normalizedQuery)
        )
      }))
      .filter((section) => section.questions.length > 0);
  }, [normalizedQuery, sections]);

  const resultCount = filteredSections.reduce((total, section) => total + section.questions.length, 0);

  return (
    <>
      <section aria-label="Search frequently asked questions" className="faqSearch">
        <label htmlFor="faq-search">Search the FAQ</label>
        <div>
          <span aria-hidden="true">⌕</span>
          <input
            autoComplete="off"
            id="faq-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try ‘prizes’, ‘camera’, ‘password’, or ‘appeal’"
            type="search"
            value={query}
          />
          {query ? <button onClick={() => setQuery("")} type="button">Clear</button> : null}
        </div>
        <p aria-live="polite">
          {normalizedQuery
            ? `${resultCount} ${resultCount === 1 ? "answer" : "answers"} found`
            : `${totalQuestions} answers across ${sections.length} topics`}
        </p>
      </section>

      {filteredSections.length > 0 ? (
        <>
          <nav aria-label="FAQ topics" className="faqTopics">
            {filteredSections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>{section.label}</a>
            ))}
          </nav>

          <div className="faqLayout">
            {filteredSections.map((section) => {
              const originalIndex = sections.findIndex((item) => item.id === section.id);
              return (
                <section className="faqSection" id={section.id} key={section.id}>
                  <header>
                    <span>{String(originalIndex + 1).padStart(2, "0")}</span>
                    <div><p>Talent7 FAQ</p><h2>{section.label}</h2></div>
                  </header>
                  <div className="faqQuestions">
                    {section.questions.map((item, questionIndex) => (
                      <details key={`${normalizedQuery}-${item.question}`} open={Boolean(normalizedQuery) || (originalIndex === 0 && questionIndex === 0)}>
                        <summary>{item.question}<span aria-hidden="true">+</span></summary>
                        <p>{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <section className="faqEmpty">
          <span aria-hidden="true">?</span>
          <h2>No matching answer yet</h2>
          <p>Try a shorter word or browse all topics. You can also contact Talent7 support.</p>
          <button onClick={() => setQuery("")} type="button">Show every question</button>
        </section>
      )}
    </>
  );
}
