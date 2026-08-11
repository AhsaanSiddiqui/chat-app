import React from "react";

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

const trimTrailingPunctuation = (url) => {
  let cleaned = url;
  let trailing = "";
  while (/[.,!?;:)"'\]]$/.test(cleaned)) {
    trailing = cleaned.slice(-1) + trailing;
    cleaned = cleaned.slice(0, -1);
  }
  return { cleaned, trailing };
};

const toHref = (url) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

/**
 * Renders plain text with http(s)/www URLs as clickable links.
 */
const LinkifiedText = ({ text }) => {
  if (!text) return null;

  const nodes = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const { cleaned, trailing } = trimTrailingPunctuation(raw);
    if (cleaned) {
      nodes.push(
        <a
          key={`link-${start}`}
          href={toHref(cleaned)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200 cursor-pointer break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {cleaned}
        </a>
      );
    } else {
      nodes.push(raw);
    }

    if (trailing) nodes.push(trailing);
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes.length ? nodes : text}</>;
};

export default LinkifiedText;
