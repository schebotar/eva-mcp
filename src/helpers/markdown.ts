import { marked } from "marked";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

/**
 * Конвертирует Markdown в HTML для отправки в EvaProject.
 * EvaProject не поддерживает Markdown — весь текст должен быть в HTML.
 *
 * @param text - Текст в формате Markdown
 * @returns Текст в формате HTML
 */
export function mdToHtml(text: string): string {
  if (!text) return text;
  return marked.parse(text, { async: false }) as string;
}

/**
 * Конвертирует HTML в Markdown для отображения пользователю.
 * EvaProject хранит текст в HTML — для читаемости конвертируем обратно.
 *
 * @param html - Текст в формате HTML
 * @returns Текст в формате Markdown
 */
export function htmlToMd(html: string): string {
  if (!html) return html;
  return turndown.turndown(html);
}
