import { Fragment } from "react";

/** Small text-only Markdown subset. HTML, images and links remain inert text. */
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function SafeMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    if (!(lines[i] ?? "").trim()) { i++; continue; }
    const ordered = /^\d+[.)]\s+/.test(lines[i] ?? "");
    const bullet = /^[-*]\s+/.test(lines[i] ?? "");
    if (ordered || bullet) {
      const pattern = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      const items = [];
      const start = i;
      while (i < lines.length && pattern.test(lines[i] ?? "")) {
        items.push(<li key={i}>{inline((lines[i] ?? "").replace(pattern, ""))}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={start} className="list-decimal space-y-1 pl-5">{items}</ol> :
        <ul key={start} className="list-disc space-y-1 pl-5">{items}</ul>);
    } else {
      blocks.push(<p key={i} className="whitespace-pre-wrap">{inline(lines[i] ?? "")}</p>);
      i++;
    }
  }
  return <div className="space-y-2 [overflow-wrap:anywhere]">{blocks}</div>;
}
